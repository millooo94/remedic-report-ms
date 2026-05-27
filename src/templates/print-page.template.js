export function buildPrintPage(fileName, base64Pdf) {
  return `
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <title>${fileName}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #2f2f2f;
        overflow: hidden;
      }

      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: none;
        background: #2f2f2f;
      }
    </style>
  </head>
  <body>
    <iframe
      id="pdfFrame"
      src="data:application/pdf;base64,${base64Pdf}"
      title="Anteprima PDF"
    ></iframe>

    <script>
      const iframe = document.getElementById("pdfFrame");

      function tryPrint() {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error("Errore apertura stampa:", e);
        }
      }

      iframe.onload = function () {
        setTimeout(tryPrint, 700);
      };

      setTimeout(tryPrint, 1500);
    </script>
  </body>
</html>
  `;
}
