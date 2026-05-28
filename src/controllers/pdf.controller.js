import { generatePdfPrintPage } from "../services/pdf.service.js";

export async function generatePdfController(req, res) {
  try {
    const htmlPage = await generatePdfPrintPage(req.body);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlPage);
  } catch (err) {
    console.error("PDF error:", err);
    res.status(err?.statusCode || 500).send(
      err?.message || "PDF generation failed",
    );
  }
}
