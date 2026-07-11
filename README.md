# AI-Powered CSV Importer

An enterprise-grade, strictly typed, production-ready CSV Ingestion and Semantic Field Mapping Engine. This system enables users to upload arbitrary, messy CSV files, inspect a fast virtualized preview in their browser, and stream real-time batch processing updates from a Node.js Express server utilizing OpenAI's Structured Outputs (JSON Schema) for smart data alignment.

---

## Technical Architecture

```text
  [Messy CSV File] -> (React-Dropzone) -> (PapaParse Client Preview Table)
                                                 |
                                         POST /api/extract-leads (Multipart FormData)
                                                 |
                                                 v
                                   [Express Ingestion Service]
                                       |                 |
                                 Returns jobId       Starts Job (Async Background)
                                       |                 |
                                       v                 v
                                Connect SSE          (Inject physical _row index)
                            /api/progress/:jobId         |
                                       ^                 v
                                       |           [Batch Ingestion Engine]
                                       |                 |
                                 Streams Progress  (AiService -> OpenAI Structured Outputs)
                                 Updates                 |
                                       |                 v
                                       +---------  (JSONRepair & Zod Validation)
                                                         |
                                                         v
                                                   (Data Normalizer)
                                                         |
                                                         v
                                                 (Deduplication check)
                                                         |
                                                         v
                                                   [Job Session Complete]
```

### Flow Breakdown

1. **Frontend Parsing & Preview**: The client loads the CSV using `PapaParse` and renders it instantly on a sticky virtualized grid.
2. **Multipart Upload & Job Handshake**: The file is uploaded to the Express backend. The server validates the headers, generates a unique `jobId`, starts a background processing loop, and immediately returns the `jobId` (HTTP 202).
3. **SSE Progress Stream**: The frontend opens a Server-Sent Events (SSE) connection to `/api/progress/:jobId`.
4. **LLM Extraction & Fallback**: The backend slices the CSV into batches and utilizes OpenAI's Structured Outputs (JSON Schema) with `temperature: 0` to map headers. If structured schema validation fails, the service falls back to standard JSON completion and cleans the payload with `jsonrepair` before executing Zod schema validation.
5. **Normalization & Deduplication**: Node.js cleans the data (lowercase emails, parses E.164 phone country codes, normalizes timestamps) and deduplicates against the current job's unique records.
6. **Detailed Metric Reporting**: Results are categorized into virtualized Success and Skipped lists (complete with physical row number and skip reasons) and streamed to the UI.

---

## Directory Structure

```text
/CSV project
├── docker-compose.yml           # Runs frontend and backend containers together
├── backend/
│   ├── src/
│   │   ├── config/              # env.ts (Zod validation), constants.ts
│   │   ├── controllers/         # Request handlers
│   │   ├── routes/              # Routes setup & Multer configuration
│   │   ├── llm/                 # Provider contracts, OpenAI, AiService
│   │   ├── services/            # JobProcessor, Normalizer
│   │   ├── validators/          # Zod schemas
│   │   ├── utils/               # Winston logger
│   │   ├── app.ts               # Express configuration
│   │   └── server.ts            # Server bootstrap & graceful shutdowns
│   ├── Dockerfile
│   └── package.json
└── frontend/
    ├── app/                     # Next.js pages & root layout
    ├── components/              # VirtualizedTable component
    ├── Dockerfile
    └── package.json
```

---

## Environment Variables

### Backend (`/backend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | Your OpenAI API key (Required) | - |
| `LLM_PROVIDER` | AI provider choice (`openai`) | `openai` |
| `PORT` | Local port the API listens on | `4000` |
| `MAX_BATCH_SIZE` | Size of batched records sent to LLM | `30` |
| `MAX_UPLOAD_SIZE_MB` | Maximum allowed file upload size | `20` |

### Frontend (`/frontend/.env` / build args)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL path (accessible by browser) | `http://localhost:4000` |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Client upload file size limit checks | `20` |

---

## Getting Started

### Method 1: Using Docker (Recommended)

Docker Compose builds both containers and sets up networking. Simply define `OPENAI_API_KEY` in your environment and run:

```bash
# Run from the root directory (where docker-compose.yml sits)
$ env OPENAI_API_KEY="your-key-here" docker-compose up --build
```

The services will be available at:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:4000](http://localhost:4000)

### Method 2: Manual Local Setup

#### Step A: Boot the Backend
Ensure you have Node.js 20+ installed.

```bash
$ cd backend
$ cp .env.example .env   # edit variables, set your OPENAI_API_KEY
$ npm install
$ npm run dev            # starts tsx watch server on port 4000
```

#### Step B: Boot the Frontend

```bash
$ cd frontend
$ npm install
$ npm run dev            # starts Next.js development server on port 3000
```

---

## API Endpoints

### 1. Health Check
* **Endpoint**: `GET /health`
* **Response**:
```json
{
  "status": "UP",
  "timestamp": "2026-07-11T12:00:00.000Z",
  "uptime": 12.34
}
```

### 2. Extract Leads Ingestion
* **Endpoint**: `POST /api/extract-leads`
* **Content-Type**: `multipart/form-data`
* **Body**:
  * `file`: (CSV file binary payload)
* **Response (HTTP 202 Accepted)**:
```json
{
  "jobId": "8f8b8c8d-8e8f-8a8b-8c8d-8e8f8a8b8c8d",
  "status": "processing"
}
```

### 3. Track Process SSE Stream
* **Endpoint**: `GET /api/progress/:jobId`
* **Response Events**:
  * **Event**: `progress`
    ```json
    {
      "progress": 50,
      "currentBatch": 2,
      "totalBatches": 4,
      "status": "processing"
    }
    ```
  * **Event**: `complete`
    ```json
    {
      "summary": {
        "totalRows": 120,
        "processedRows": 120,
        "successCount": 115,
        "skippedCount": 5,
        "processingTimeMs": 2840
      },
      "success": [...],
      "skipped": [
        { "row": 24, "reason": "Duplicate email" },
        { "row": 89, "reason": "Invalid phone number" }
      ]
    }
    ```

---

## In-Memory Job Cleanup & TTL

To prevent memory leaks:
* Processed and failed jobs are stored in-memory.
* After a job is registered, a cleanup timer runs with a Time-To-Live (TTL) of **10 minutes**.
* Once expired, the job resources are freed and any dangling SSE connections are automatically closed.

---

## Automated Tests

Unit tests are written with `Vitest` covering the normalizer, validation rules, and JSON repair logic.

To run the test suite:
```bash
$ cd backend
$ npm run test
```

---

## Assumptions & Design Decisions

1. **Physical Line Numbering**: The `_row` property represents the actual physical CSV line number (starting at `2` for the first data row, assuming row `1` contains headers). This allows users to find the exact line in spreadsheets.
2. **Duplicate Logic**: In the deduplication phase, emails and phones (country code + mobile) are checked for uniqueness inside the current ingestion job scope.
3. **Robust Phone Slicing**: If country code and mobile parts are uploaded together (e.g. `+91 98765 43210` or `11234567890`), the normalizer uses E.164 parsing heuristics to split them correctly. If a phone number is shorter than 7 digits or longer than 15 digits total, it is skipped with `"Invalid phone number"`.
4. **CRM Field Multiples**: If multiple email or phone strings are discovered inside a single field (or row), the primary email/phone is extracted, and the surplus metadata is automatically appended to `crm_note` to ensure zero data loss.

---

## Deployment Guides

### Frontend (Vercel)
1. Fork/push the code to Github.
2. Link the repository to your Vercel Dashboard.
3. Set the root directory of the project to `frontend`.
4. Add the Environment Variable `NEXT_PUBLIC_BACKEND_URL` pointing to your deployed Express backend URL (e.g., `https://api.my-csv-service.com`).
5. Click **Deploy**.

### Backend (Render / Railway)
1. Link your repository.
2. Set the root directory to `backend`.
3. Select Environment: `Node`.
4. Build Command: `npm install && npm run build`
5. Start Command: `npm run start`
6. Add Environment Variables:
   - `OPENAI_API_KEY`: (Your production API key)
   - `PORT`: `4000`
   - `MAX_BATCH_SIZE`: `30`
   - `MAX_UPLOAD_SIZE_MB`: `20`
   - `LLM_PROVIDER`: `openai`
