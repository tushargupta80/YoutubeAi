export function splitTranscript(transcriptItems, options = {}) {
  const chunkSize = options.chunkSize || 900;
  const overlap = options.overlap || 180;
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const item of transcriptItems) {
    if (currentLength + item.text.length > chunkSize && current.length) {
      const first = current[0];
      const last = current[current.length - 1];
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        text: current.map((entry) => entry.text).join(" "),
        startMs: first.offset,
        endMs: last.offset + last.duration
      });

      const overlapItems = [];
      let overlapLength = 0;
      for (let i = current.length - 1; i >= 0; i -= 1) {
        overlapItems.unshift(current[i]);
        overlapLength += current[i].text.length;
        if (overlapLength >= overlap) break;
      }

      current = overlapItems;
      currentLength = overlapLength;
    }

    current.push(item);
    currentLength += item.text.length;
  }

  if (current.length) {
    const first = current[0];
    const last = current[current.length - 1];
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      text: current.map((entry) => entry.text).join(" "),
      startMs: first.offset,
      endMs: last.offset + last.duration
    });
  }

  return chunks;
}
