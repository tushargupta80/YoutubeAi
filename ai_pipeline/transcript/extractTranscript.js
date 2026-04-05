import {
  YoutubeTranscript,
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError
} from "youtube-transcript/dist/youtube-transcript.esm.js";

const PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_LANG_ORDER = ["en", "en-US", "en-GB", "hi", "hi-IN"];
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

function normalizeTranscriptItems(transcript) {
  const items = transcript.map((item, index) => ({
    index,
    text: String(item.text || "").trim(),
    offset: Number(item.offset || 0),
    duration: Number(item.duration || 0),
    lang: item.lang || item.languageCode || undefined
  })).filter((item) => item.text);

  return {
    transcript: items,
    plainText: items.map((item) => item.text).join(" ")
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
      return await fetchTranscriptWithClient(videoId, client, preferredLanguages, fetchImpl);
    } catch (error) {
      lastError = error;
      if (error instanceof YoutubeTranscriptTooManyRequestError || error instanceof YoutubeTranscriptVideoUnavailableError) {
        throw error;
      }
    }
  }

  throw lastError || new YoutubeTranscriptNotAvailableLanguageError(preferredLanguages[0], [], videoId);
}

export async function extractTranscript(youtubeUrl) {
  const transcriptClient = YoutubeTranscript?.fetchTranscript ? YoutubeTranscript : { fetchTranscript };
  const preferredLanguages = DEFAULT_LANG_ORDER;
  const videoId = retrieveVideoId(youtubeUrl);

  try {
    const transcript = await transcriptClient.fetchTranscript(youtubeUrl, { lang: preferredLanguages[0] });
    return normalizeTranscriptItems(transcript);
  } catch (primaryError) {
    if (primaryError instanceof YoutubeTranscriptTooManyRequestError || primaryError instanceof YoutubeTranscriptVideoUnavailableError) {
      throw primaryError;
    }

    try {
      const transcript = await fetchTranscriptWithAlternateClients(videoId, preferredLanguages);
      return normalizeTranscriptItems(transcript);
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : primaryError;
    }
  }
}
