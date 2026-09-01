# Legal Metrology Digital Verification System — V12

SIH prototype demonstrating digital registration, verification, certification and QR-based certificate validation for measuring instruments.

## Workflow

OWNER → Register Instrument → Submit Application → ADMIN Assigns & Schedules → LMO/GATC Verifies → Digital Certificate → QR Verification

## Roles

- OWNER — register instruments and submit verification applications
- ADMIN — manage applications, assign and schedule verification
- LMO — perform verification
- GATC — perform verification as an approved test centre

## Tech Stack

- Frontend: HTML, Tailwind CSS, JavaScript
- Backend: Python / Flask
- Database: SQLite via Flask-SQLAlchemy
- Authentication: JWT
- QR generation: qrcode

## Demo accounts

| Role | Email | Password |
|---|---|---|
| ADMIN | admin@legalmetrology.gov | admin123 |
| LMO | lmo@legalmetrology.gov | lmo123 |
| GATC | gatc@legalmetrology.gov | gatc123 |
| OWNER | owner@example.com | owner123 |

These are prototype/demo credentials only.

## Run

```bash
cd backend
pip install -r requirements.txt
python seed.py
python app.py
```

Then open `frontend/index.html`.

For phone-based QR testing on the same Wi-Fi, set `PUBLIC_BASE_URL` in the backend environment to the laptop's LAN address, e.g. `http://192.168.1.10:5000`, and set the browser's `LM_API_BASE` to the same address if required by your setup.
