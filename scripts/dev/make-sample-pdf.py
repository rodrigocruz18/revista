"""Dev-only helper: generates a throwaway multi-page PDF with real text so
the flipbook, search, text layer, and voice reader can be exercised locally.
Not part of the shipped app — never referenced by the Next.js code."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm

OUT = "/home/claude/revista-tenis/public/magazines/2026-08-revista-tenis.pdf"

PLAYERS = [
    "Carlos Alcaraz", "Novak Djokovic", "Jannik Sinner", "Iga Swiatek",
    "Coco Gauff", "Rafael Nadal", "Roger Federer", "Emma Raducanu",
]

c = canvas.Canvas(OUT, pagesize=A4)
width, height = A4

for page in range(1, 41):
    c.setFillColorRGB(0.96, 0.95, 0.89)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColorRGB(0.05, 0.05, 0.05)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(2 * cm, height - 3 * cm, f"Revista Tenis — Agosto 2026")
    c.setFont("Helvetica", 14)
    c.drawString(2 * cm, height - 4 * cm, f"Pagina {page}")

    player = PLAYERS[page % len(PLAYERS)]
    c.setFont("Helvetica-Bold", 20)
    c.drawString(2 * cm, height - 6 * cm, f"Perfil: {player}")

    c.setFont("Helvetica", 12)
    body = (
        f"En esta edicion conversamos con {player} sobre su temporada, "
        f"su preparacion fisica y sus objetivos de cara al proximo torneo "
        f"de Grand Slam. {player} comento que el circuito ATP y WTA de "
        f"este 2026 ha sido especialmente competitivo, con partidos "
        f"definidos por detalles minimos en el ranking mundial."
    )
    text_obj = c.beginText(2 * cm, height - 7.5 * cm)
    text_obj.setFont("Helvetica", 12)
    text_obj.setLeading(16)
    line = ""
    for word in body.split(" "):
        if len(line) + len(word) > 70:
            text_obj.textLine(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        text_obj.textLine(line)
    c.drawText(text_obj)

    c.setFont("Helvetica-Oblique", 10)
    c.drawString(2 * cm, 2 * cm, f"Revista Tenis · agosto 2026 · pagina {page} de 40")

    c.showPage()

c.save()
print("Wrote", OUT)
