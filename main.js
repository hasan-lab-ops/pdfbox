let selectedFile = null;

const dropzone = document.getElementById("dropzone");
const input = document.getElementById("file-input");

dropzone.onclick = () => input.click();

input.onchange = (e) => {
  selectedFile = e.target.files[0];
};

dropzone.ondragover = (e) => {
  e.preventDefault();
};

dropzone.ondrop = (e) => {
  e.preventDefault();
  selectedFile = e.dataTransfer.files[0];
};

document.getElementById("convert-btn").onclick = async () => {
  if (!selectedFile) {
    alert("Select file first");
    return;
  }

  await convertWordToPdfAdvanced(selectedFile);
};

function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

function showLoading() {
  document.getElementById("loading").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loading").classList.add("hidden");
}

function updateProgress(v) {
  document.getElementById("progress-fill").style.width = v + "%";
}