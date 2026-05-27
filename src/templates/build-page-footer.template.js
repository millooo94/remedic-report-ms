export function buildPageFooterTemplate() {
  return `
    <div style="
      width: 100%;
      padding: 0 8mm 2mm 8mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #4A4A4A;
      box-sizing: border-box;
      text-align: right;
    ">
      Pagina <span class="pageNumber"></span> di <span class="totalPages"></span>
    </div>
  `;
}
