export function buildPageHeaderTemplate(logoSrc) {
  return `
    <div style="
      width: 100%;
      padding: 3mm 12mm 0 12mm;
      font-family: Arial, Helvetica, sans-serif;
      color: #4A4A4A;
      font-size: 8pt;
      box-sizing: border-box;
    ">
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10mm;
        padding-bottom: 3mm;
        width: 100%;
      ">
        <div style="flex: 0 0 auto;">
          <img src="${logoSrc}" style="height: 15mm; width: auto; display: block;" />
        </div>

        <div style="
          flex: 1 1 auto;
          text-align: right;
          color: #4A4A4A;
          font-size: 8pt;
          line-height: 1.15;
          max-width: 85mm;
        ">
          <div style="margin: 0 0 0.2mm 0;">
            <strong>Denominazione:</strong> Humancare Telemedicine S.r.l.
          </div>
          <div style="margin: 0 0 0.2mm 0;">
            <strong>Sede Legale:</strong> Via G. Verga, 56 95024 Acireale (CT)
          </div>
          <div style="margin: 0 0 0.2mm 0;">
            <strong>Sede Operativa:</strong> Via S. Vigo, 97/H 95024 Acireale (CT)
          </div>
          <div style="margin: 0 0 0.2mm 0;">
            <strong>Codice Fiscale/P.IVA:</strong> 06101620877
          </div>
          <div style="margin: 0;">
            <strong>Tel:</strong> +39 095 0904525
          </div>
        </div>
      </div>
    </div>
  `;
}
