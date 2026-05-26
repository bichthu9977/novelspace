export function setupChapterAudioPlayer(storageKeys) {
  const audio = document.getElementById("chapterAudio");
  const speedSelect = document.getElementById("audioSpeedSelect");

  if (!audio) return;

  const savedSpeed = Number(localStorage.getItem(storageKeys.audioSpeed) || "1");

  if (Number.isFinite(savedSpeed) && savedSpeed > 0) {
    audio.playbackRate = savedSpeed;

    if (speedSelect) {
      speedSelect.value = String(savedSpeed);
    }
  }

  if (speedSelect) {
    speedSelect.addEventListener("change", () => {
      const speed = Number(speedSelect.value);

      if (Number.isFinite(speed) && speed > 0) {
        audio.playbackRate = speed;
        localStorage.setItem(storageKeys.audioSpeed, String(speed));
      }
    });
  }
}
