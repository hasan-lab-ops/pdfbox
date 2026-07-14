async function convertWordToPdfAdvanced(file) {
  try {
    showLoading();
    updateProgress(20);

    const arrayBuffer = await file.arrayBuffer();

    const result = await mammoth.convertToHtml({ arrayBuffer });
    let html = result.value;

    if (!html) throw "Empty file";

    const container = document.createElement("div");

    container.innerHTML = html;
    container.style.padding = "20px";
    container.style.background = "white";

    document.body.appendChild(container);

    updateProgress(60);

    const pageSize = document.getElementById("page-size").value;

    await html2pdf()
      .set({
        filename: file.name.replace(".docx", ".pdf"),
        html2canvas: { scale: 2 },
        jsPDF: { format: pageSize }
      })
      .from(container)
      .save();

    updateProgress(100);

    document.body.removeChild(container);
    hideLoading();

  } catch (e) {
    hideLoading();
    alert("Error: " + e);
  }
}