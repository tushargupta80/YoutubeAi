import { spawn } from "node:child_process";
import {
  YoutubeTranscript,
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError
} from "youtube-transcript/dist/youtube-transcript.esm.js";
import { env } from "../../backend/config/env.js";
import { logInfo, logWarn } from "../../backend/utils/logger.js";

const PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_LANG_ORDER = ["en", "en-US", "en-GB", "en-IN", "hi", "hi-IN"];
const INNER_TUBE_CLIENTS = [
  {
    clientName: "WEB",
    clientVersion: "2.20250312.01.00",
    userAgent: WEB_USER_AGENT,
    hl: "en",
    gl: "US"
  },
  {
    clientName: "MWEB",
    clientVersion: "2.20250312.01.00",
    userAgent: WEB_USER_AGENT,
    hl: "en",
    gl: "US"
  },
  {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
    hl: "en",
    gl: "US"
  },
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)",
    hl: "en",
    gl: "US"
  },
  {
    clientName: "TVHTML5",
    clientVersion: "7.20250312.16.00",
    userAgent: WEB_USER_AGENT,
    hl: "en",
    gl: "US"
  }
];

function normalizeTranscriptItems(transcript, meta = {}) {
  const items = transcript.map((item, index) => ({
    index,
    text: String(item.text || "").trim(),
    offset: Number(item.offset || 0),
    duration: Number(item.duration || 0),
    lang: item.lang || item.languageCode || undefined
  })).filter((item) => item.text);

  return {
    transcript: items,
    plainText: items.map((item) => item.text).join(" "),
    source: meta.source || "unknown",
    client: meta.client || null,
    languageCode: meta.languageCode || items[0]?.lang || null
  };
}

function retrieveVideoId(value) {
  const source = String(value || "").trim();
  if (source.length === 11 && !source.includes("/")) return source;
  const match = source.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (match?.[1]) return match[1];
  throw new Error("Impossible to retrieve Youtube video ID.");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function parseTranscriptXml(xml, lang) {
  const items = [];
  const paragraphPattern = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let paragraphMatch;

  while ((paragraphMatch = paragraphPattern.exec(xml)) !== null) {
    const offset = parseInt(paragraphMatch[1], 10);
    const duration = parseInt(paragraphMatch[2], 10);
    const inner = paragraphMatch[3];
    let text = "";
    const segmentPattern = /<s[^>]*>([^<]*)<\/s>/g;
    let segmentMatch;

    while ((segmentMatch = segmentPattern.exec(inner)) !== null) {
      text += segmentMatch[1];
    }

    text ||= inner.replace(/<[^>]+>/g, "");
    text = decodeEntities(text).trim();

    if (text) {
      items.push({ text, duration, offset, lang });
    }
  }

  if (items.length > 0) {
    return items;
  }

  return [...xml.matchAll(/<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g)].map((match) => ({
    text: decodeEntities(match[3]).trim(),
    duration: parseFloat(match[2]),
    offset: parseFloat(match[1]),
    lang
  })).filter((item) => item.text);
}

function parseVttTranscript(vtt, lang) {
  const blocks = String(vtt || "").split(/\r?\n\r?\n/);
  const items = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingLine = lines.find((line) => line.includes("-->") && line.includes(":"));
    if (!timingLine) continue;

    const timingMatch = timingLine.match(/(?<start>\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(?<end>\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!timingMatch?.groups) continue;

    const text = lines.slice(lines.indexOf(timingLine) + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    const toMs = (stamp) => {
      const [hours, minutes, seconds] = stamp.split(":");
      return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
    };

    const start = toMs(timingMatch.groups.start);
    const end = toMs(timingMatch.groups.end);
    items.push({ text: decodeEntities(text), offset: start, duration: Math.max(end - start, 0), lang });
  }

  return items;
}

function parseJson3Transcript(payload, lang) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.map((event) => {
    const segments = Array.isArray(event?.segs) ? event.segs : [];
    const text = segments.map((segment) => segment?.utf8 || "").join("").replace(/\s+/g, " ").trim();
    return {
      text,
      offset: Number(event?.tStartMs || 0),
      duration: Number(event?.dDurationMs || 0),
      lang
    };
  }).filter((item) => item.text);
}

function rankTrack(track, preferredLanguages) {
  const languageCode = String(track.languageCode || "").toLowerCase();
  const preferredIndex = preferredLanguages.findIndex((entry) => entry.toLowerCase() === languageCode);
  const isAsr = String(track.kind || "").toLowerCase() === "asr";
  return {
    preferredIndex: preferredIndex === -1 ? Number.MAX_SAFE_INTEGER : preferredIndex,
    isAsr,
    languageCode
  };
}

function pickCaptionTrack(tracks, preferredLanguages) {
  const sorted = [...tracks].sort((left, right) => {
    const leftRank = rankTrack(left, preferredLanguages);
    const rightRank = rankTrack(right, preferredLanguages);

    if (leftRank.preferredIndex !== rightRank.preferredIndex) {
      return leftRank.preferredIndex - rightRank.preferredIndex;
    }

    if (leftRank.isAsr !== rightRank.isAsr) {
      return leftRank.isAsr ? 1 : -1;
    }

    return leftRank.languageCode.localeCompare(rightRank.languageCode);
  });

  return sorted[0];
}

async function fetchCaptionTrack(baseUrl, lang, fetchImpl = fetch) {
  const response = await fetchImpl(baseUrl, {
    headers: {
      "Accept-Language": lang || "en-US,en;q=0.9",
      "User-Agent": WEB_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new YoutubeTranscriptNotAvailableError(baseUrl);
  }

  const xml = await response.text();
  return parseTranscriptXml(xml, lang);
}

async function fetchTranscriptWithClient(videoId, client, preferredLanguages, fetchImpl = fetch) {
  const response = await fetchImpl(PLAYER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": client.userAgent
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: client.hl,
          gl: client.gl
        }
      },
      videoId
    })
  });

  if (!response.ok) {
    throw new Error(`InnerTube ${client.clientName} responded with ${response.status}`);
  }

  const json = await response.json();
  const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new YoutubeTranscriptDisabledError(videoId);
  }

  const selectedTrack = pickCaptionTrack(tracks, preferredLanguages);
  if (!selectedTrack?.baseUrl) {
    throw new YoutubeTranscriptNotAvailableError(videoId);
  }

  const items = await fetchCaptionTrack(selectedTrack.baseUrl, selectedTrack.languageCode || preferredLanguages[0], fetchImpl);
  if (!items.length) {
    throw new YoutubeTranscriptNotAvailableError(videoId);
  }

  return items;
}

async function fetchTranscriptWithAlternateClients(videoId, preferredLanguages, fetchImpl = fetch) {
  let lastError;

  for (const client of INNER_TUBE_CLIENTS) {
    try {
      const transcript = await fetchTranscriptWithClient(videoId, client, preferredLanguages, fetchImpl);
      logInfo("Transcript fallback client succeeded", {
        videoId,
        transcriptSource: "alternate-client",
        transcriptClient: client.clientName,
        transcriptLanguage: transcript[0]?.lang || preferredLanguages[0],
        transcriptItemCount: transcript.length
      });
      return transcript;
    } catch (error) {
      lastError = error;
      logWarn("Transcript fallback client failed", {
        videoId,
        transcriptSource: "alternate-client",
        transcriptClient: client.clientName,
        error: error instanceof Error ? error.message : String(error)
      });
      if (error instanceof YoutubeTranscriptVideoUnavailableError) {
        throw error;
      }
    }
  }

  throw lastError || new YoutubeTranscriptNotAvailableLanguageError(preferredLanguages[0], [], videoId);
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `Command exited with code ${code}`));
    });
  });
}

function rankYtDlpTrack(languageCode, isAutoGenerated, preferredLanguages) {
  const normalized = String(languageCode || "").toLowerCase();
  const preferredIndex = preferredLanguages.findIndex((entry) => entry.toLowerCase() === normalized);
  return {
    preferredIndex: preferredIndex === -1 ? Number.MAX_SAFE_INTEGER : preferredIndex,
    isAutoGenerated,
    normalized
  };
}

function pickYtDlpTrack(metadata, preferredLanguages) {
  const entries = [];
  const addEntries = (bucket, sourceType, isAutoGenerated) => {
    for (const [languageCode, formats] of Object.entries(bucket || {})) {
      if (!Array.isArray(formats)) continue;
      for (const format of formats) {
        if (!format?.url) continue;
        entries.push({
          languageCode,
          sourceType,
          isAutoGenerated,
          url: format.url,
          ext: String(format.ext || "").toLowerCase(),
          protocol: String(format.protocol || "").toLowerCase(),
          name: format.name || ""
        });
      }
    }
  };

  addEntries(metadata?.subtitles, "subtitles", false);
  addEntries(metadata?.automatic_captions, "automatic_captions", true);

  const extensionPreference = ["json3", "srv3", "srv2", "srv1", "ttml", "vtt"];
  const protocolPreference = ["https", "http"];

  entries.sort((left, right) => {
    const leftRank = rankYtDlpTrack(left.languageCode, left.isAutoGenerated, preferredLanguages);
    const rightRank = rankYtDlpTrack(right.languageCode, right.isAutoGenerated, preferredLanguages);

    if (leftRank.preferredIndex !== rightRank.preferredIndex) {
      return leftRank.preferredIndex - rightRank.preferredIndex;
    }

    if (leftRank.isAutoGenerated !== rightRank.isAutoGenerated) {
      return leftRank.isAutoGenerated ? 1 : -1;
    }

    const leftExt = extensionPreference.indexOf(left.ext);
    const rightExt = extensionPreference.indexOf(right.ext);
    if (leftExt !== rightExt) {
      return (leftExt === -1 ? Number.MAX_SAFE_INTEGER : leftExt) - (rightExt === -1 ? Number.MAX_SAFE_INTEGER : rightExt);
    }

    const leftProtocol = protocolPreference.indexOf(left.protocol);
    const rightProtocol = protocolPreference.indexOf(right.protocol);
    return (leftProtocol === -1 ? Number.MAX_SAFE_INTEGER : leftProtocol) - (rightProtocol === -1 ? Number.MAX_SAFE_INTEGER : rightProtocol);
  });

  return entries[0] || null;
}

async function fetchYtDlpTranscriptTrack(track, fetchImpl = fetch) {
  const response = await fetchImpl(track.url, {
    headers: {
      "Accept-Language": track.languageCode || "en-US,en;q=0.9",
      "User-Agent": WEB_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`yt-dlp subtitle fetch failed with ${response.status}`);
  }

  if (track.ext === "json3") {
    const payload = await response.json();
    return parseJson3Transcript(payload, track.languageCode);
  }

  const body = await response.text();
  if (track.ext === "vtt") {
    return parseVttTranscript(body, track.languageCode);
  }

  return parseTranscriptXml(body, track.languageCode);
}

async function fetchTranscriptWithYtDlp(youtubeUrl, videoId, preferredLanguages, fetchImpl = fetch) {
  if (!env.ytDlpEnabled) {
    throw new Error("yt-dlp fallback is disabled");
  }

  const args = [
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    `${preferredLanguages.join(",")},all`,
    "--sub-format",
    "json3/vtt/best",
    "--dump-single-json",
    youtubeUrl
  ];

  logInfo("Transcript yt-dlp fallback started", {
    videoId,
    transcriptSource: "yt-dlp",
    transcriptClient: env.ytDlpBinary,
    transcriptLanguage: preferredLanguages[0]
  });

  const { stdout } = await runCommand(env.ytDlpBinary, args, env.ytDlpTimeoutMs);
  const metadata = JSON.parse(stdout);
  const track = pickYtDlpTrack(metadata, preferredLanguages);

  if (!track?.url) {
    throw new YoutubeTranscriptNotAvailableLanguageError(preferredLanguages[0], Object.keys(metadata?.subtitles || {}), videoId);
  }

  const transcript = await fetchYtDlpTranscriptTrack(track, fetchImpl);
  if (!transcript.length) {
    throw new YoutubeTranscriptNotAvailableError(videoId);
  }

  logInfo("Transcript yt-dlp fallback succeeded", {
    videoId,
    transcriptSource: "yt-dlp",
    transcriptClient: env.ytDlpBinary,
    transcriptLanguage: track.languageCode,
    transcriptItemCount: transcript.length,
    transcriptTrackType: track.sourceType,
    transcriptTrackExt: track.ext
  });

  return transcript;
}

export async function extractTranscript(youtubeUrl) {
  const transcriptClient = YoutubeTranscript?.fetchTranscript ? YoutubeTranscript : { fetchTranscript };
  const preferredLanguages = DEFAULT_LANG_ORDER;
  const videoId = retrieveVideoId(youtubeUrl);

  try {
    const transcript = await transcriptClient.fetchTranscript(youtubeUrl, { lang: preferredLanguages[0] });
    logInfo("Transcript extraction succeeded", {
      videoId,
      transcriptSource: "youtube-transcript",
      transcriptClient: "default-library",
      transcriptLanguage: transcript[0]?.lang || preferredLanguages[0],
      transcriptItemCount: transcript.length
    });
    return normalizeTranscriptItems(transcript, {
      source: "youtube-transcript",
      client: "default-library",
      languageCode: transcript[0]?.lang || preferredLanguages[0]
    });
  } catch (primaryError) {
    logWarn("Primary transcript extraction failed", {
      videoId,
      transcriptSource: "youtube-transcript",
      transcriptClient: "default-library",
      error: primaryError instanceof Error ? primaryError.message : String(primaryError)
    });

    if (primaryError instanceof YoutubeTranscriptVideoUnavailableError) {
      throw primaryError;
    }

    try {
      const transcript = await fetchTranscriptWithAlternateClients(videoId, preferredLanguages);
      return normalizeTranscriptItems(transcript, {
        source: "alternate-client",
        client: "fallback-chain",
        languageCode: transcript[0]?.lang || preferredLanguages[0]
      });
    } catch (alternateError) {
      logWarn("Transcript alternate client chain failed", {
        videoId,
        transcriptSource: "alternate-client",
        transcriptClient: "fallback-chain",
        error: alternateError instanceof Error ? alternateError.message : String(alternateError)
      });

      try {
        const transcript = await fetchTranscriptWithYtDlp(youtubeUrl, videoId, preferredLanguages);
        return normalizeTranscriptItems(transcript, {
          source: "yt-dlp",
          client: env.ytDlpBinary,
          languageCode: transcript[0]?.lang || preferredLanguages[0]
        });
      } catch (ytDlpError) {
        logWarn("Transcript extraction failed after all fallbacks", {
          videoId,
          transcriptSource: "yt-dlp",
          transcriptClient: env.ytDlpBinary,
          error: ytDlpError instanceof Error ? ytDlpError.message : String(ytDlpError)
        });
        throw ytDlpError instanceof Error ? ytDlpError : alternateError instanceof Error ? alternateError : primaryError;
      }
    }
  }
}