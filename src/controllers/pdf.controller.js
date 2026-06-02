import { generatePdfPreview, generatePdfPrintPage } from "../services/pdf.service.js";

export async function generatePdfController(req, res) {
  try {
    const { htmlPage, drive } = await generatePdfPrintPage(req.body);
    if (drive?.driveFileId) {
      res.setHeader("x-remedic-drive-file-id", drive.driveFileId);
    }
    if (drive?.driveWebViewLink) {
      res.setHeader("x-remedic-drive-link", drive.driveWebViewLink);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlPage);
  } catch (err) {
    console.error("PDF error:", err);
    res.status(err?.statusCode || 500).send(
      err?.message || "PDF generation failed",
    );
  }
}

export async function generatePdfPreviewController(req, res) {
  try {
    const { buffer, fileName } = await generatePdfPreview(req.body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error("PDF preview error:", err);
    res.status(err?.statusCode || 500).send(
      err?.message || "PDF preview generation failed",
    );
  }
}
