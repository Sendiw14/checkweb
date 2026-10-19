# Label printing

The software produces a vector PDF of QR labels. Whether a label **scans reliably on a part** depends on your
printer, label stock, the part's surface and handling. None of that can be verified from software: it must be
tested with your hardware. This guide is the procedure.

> **Nothing here has been tested with a physical printer or a phone camera.** The PDFs are verified
> programmatically (they are rasterised and every QR is decoded and matched to the database), which proves the
> data and geometry are right, not that your printer reproduces them.

## What is on a label

* A QR code encoding `https://<PUBLIC_SITE_URL>/verify#<43-character token>`. Phone cameras open the link
  directly; no app is needed.
* The human-readable **serial** (`AXM-00012345`), product name and part number.
* A **backup code** (20 characters in five groups, e.g. `ABCD-EFGH-JKMN-PQRS-TVWX`) for labels that are scuffed
  or won't scan. Customers can type it at `/verify`.
* Optional cut guides and registration ticks.

The serial is an identifier, **not a secret**; the token and backup code are the secrets. Treat the PDF like
cash: it contains live codes for the whole job.

## Layout settings (Staff → QR labels → Generate labels)

| Setting | Default | Notes |
|---|---|---|
| Paper | A4 | US Letter also supported |
| Label size | 50 × 30 mm | Match your stock |
| QR size | 22 mm | Printed symbol *without* quiet zone |
| Margins / gaps | 10 / 10 / 3 / 3 mm | Match your sheet or roll geometry |
| Error correction | Q | `H` survives more damage but makes a denser code; `M` is not recommended |

The wizard checks physical sense and refuses impossible layouts:

* The QR plus its **quiet zone** (4 modules of blank border) must fit the label height; it also needs room for the serial beside it.
* **Module size** (one square of the QR) below **0.33 mm** is an error; below **0.40 mm** is a warning. The default layout gives about **0.54 mm**, which prints reliably on most thermal-transfer and laser printers.
* The preview is drawn to scale, with the quiet zone as a dashed line and the first label highlighted.

## Test before every new stock, printer or layout

1. `pnpm labels:sample` writes `.local/sample-labels.pdf` with SAMPLE labels using the **same renderer** as production. Its codes are random and are *not stored*, so they open `/verify` and are (correctly) reported as "We can't match this code". (Or generate a small real batch in a development database to see them verify.)
2. Print at **100% / Actual size**. Turn off "Fit to page", "Shrink to fit" and any driver scaling. Measure the quiet-zone square with a ruler.
3. Apply to a representative part: the real material, curvature, temperature, and finish.
4. Scan with **at least one iPhone and one Android phone**, in normal and dim light, at arm's length and close up, flat and at an angle. Try the built-in Camera app (not a QR app).
5. Scuff one label with an abrasive pad and a fingernail; confirm it still scans (error correction) or that the backup code works.
6. Only then run production batches.

## Printers and stock

| Technology | Notes |
|---|---|
| **Thermal transfer** (ribbon) | Best durability for industrial/automotive; use a resin or wax-resin ribbon for oil, solvent, heat |
| Direct thermal | Fades with heat/light/abrasion; not for engine bay or long life |
| Laser on sheets | Fine for packaging; check toner adhesion on the part |
| Inkjet | Not recommended for parts (smears) |

Choose stock rated for the surface, temperature and chemicals the part will see. A scannable QR on a label that
peels off is not an anti-counterfeit measure. Consider tamper-evident (destructible) stock where cloning of
high-value parts is a concern.

## The workflow, and why it has so many steps

```
Generate (codes issued, PDFs made)  →  Printed (a person confirms)  →  Applied (a person confirms)
   →  Pass QC  →  Release (a different permission)  →  verifiable by customers
```

* Generating labels **does not** make parts verifiable. Until a unit is *applied*, *QC-passed* and *released*,
  scanning its label answers "Not yet released". This stops half-finished stock being reported as genuine.
* "Applied" is only ever set by a person (the physical fact can't be inferred by software).
* The database refuses to release a unit with no active token or an unapplied label.
* Production operators confirm printing and applying and pass QC; **releasing is a separate permission**
  (warehouse operator, admin, owner).

## Files, downloads and expiry

* PDFs are split into parts (files) when large. Each part is downloaded from the job page; each download is
  authorized (`labels.download`), rate limited (30/hour/user) and audited with the file's SHA-256.
* Files are stored privately and **expire after 14 days** (Settings → Labels/Retention) and are purged by the
  maintenance cron. They cannot be regenerated: the system stores only hashes of the tokens. If a file expires
  unprinted, use **Replace label** on the affected units; this revokes the old code and issues a new one.
* Don't email or chat the PDFs. Move them to the print workstation through the download link only.

## Damaged, lost or mis-printed labels

| Situation | What to do |
|---|---|
| Label damaged before or at application | *Part unit → ⋯ → Report damaged label*; then *Replace label* (new code, old code revoked) |
| Wrong label applied to a part | *Replace label* on both units; investigate how it happened |
| PDF leaked or sent to the wrong person | Revoke the affected tokens; see [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) |
| Printed too many | Unused labels can be left unreleased; the units stay "not released" and are never reported genuine |

## Sheet and roll notes

The renderer lays labels out on sheets. For **roll printers**, set the page to the roll width and a label
height equal to the pitch, margins 0, and use your printer driver's label mode; test alignment on a few inches
before a long run. Native roll/ZPL/EPL output is **not** implemented; use the PDF through your printer driver.
