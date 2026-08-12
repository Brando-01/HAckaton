# Backend Code Consolidation Analysis
**Project:** Hackathon Telecom Desafío 1  
**Analysis Date:** 2026-08-12  
**Total Backend Files Analyzed:** 21 files

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Lines of Code** | 4,918 lines |
| **Largest File** | ragService.js (938 lines) |
| **Root-level Files** | 6 files |
| **Routes** | 2 files (81 lines) |
| **Scripts** | 4 files (429 lines) |
| **Services** | 9 files (3,309 lines) |

---

## Detailed File Analysis

### ROOT-LEVEL FILES (Backend Root Directory)

| File | Lines | Purpose | Merge Target | Action |
|------|-------|---------|--------------|--------|
| **server.js** | 892 | Main Express app, auth, request handlers, all routes | Modularize | **REFACTOR**: Split into separate route files; keep only server initialization |
| **db.js** | 143 | SQLite database initialization, table creation, JSON seeding | dbService.js | **MERGE**: Combine DB init/query logic into `services/dbService.js` |
| **convertirData.js** | 34 | CSV/JSON data transformation utility | scripts/ | **MOVE**: Relocate to `scripts/transformDataFormat.js` (active data processing) |
| **debug_rag.js** | 10 | Temporary RAG testing code | Archive | **DELETE**: Remove; it's test/debug code (not in test/) |
| **test_chat.js** | 36 | Manual API test for chat endpoint | test/ | **MOVE**: Relocate to `test/chat.test.js` or delete |
| **test_request.js** | 26 | Manual API test script | test/ | **MOVE**: Relocate to `test/requests.test.js` or delete |

**Root Consolidation Impact:** 
- Remove: 3 files (72 lines) - debug_rag.js, move test files
- Refactor: 1 file - server.js
- Merge: 1 file - db.js into dbService.js  
- Move: 1 file - convertirData.js to scripts/
- **Estimated Savings:** 72 lines + cleaner root structure

---

### ROUTES DIRECTORY

| File | Lines | Purpose | Merge Target | Action |
|------|-------|---------|--------------|--------|
| **nbo.js** | 17 | NBO recommendation endpoint | server.js or services/ | **KEEP**: Separate route file is good; properly located |
| **webhook.js** | 64 | WhatsApp/Meta webhook endpoint | server.js or services/ | **KEEP**: Separate route file is good; properly located |

**Routes Impact:** ✅ Well-organized. No consolidation needed.

---

### SCRIPTS DIRECTORY (Data Processing Utilities)

| File | Lines | Purpose | Merge Target | Action |
|------|-------|---------|--------------|--------|
| **cargarDatasetsDB.js** | 131 | Load CSV datasets into SQLite | import_*.js | **KEEP**: Separate orchestrator; OK to consolidate with import_csv |
| **import_csv_to_sqlite.js** | 90 | CSV to SQLite import logic | cargarDatasetsDB.js | **MERGE**: Consolidate into cargarDatasetsDB.js |
| **import_xlsx_to_sqlite.js** | 184 | XLSX to SQLite import logic | cargarDatasetsDB.js | **MERGE**: Consolidate into cargarDatasetsDB.js (or separate if too complex) |
| **inspect_xlsx.js** | 24 | Debug utility to inspect XLSX structure | utils/ | **ARCHIVE**: Debugging utility; document & remove or move to utils/ folder |

**Scripts Consolidation Impact:**
- Merge: 2 files into cargarDatasetsDB.js (-90 lines, +inline)
- Archive: 1 file (-24 lines)
- **Estimated Savings:** 24 lines removed, reduced file count

---

### SERVICES DIRECTORY (Business Logic & Core Features)

| File | Lines | Purpose | Consolidation Opportunity | Action |
|------|-------|---------|---------------------------|--------|
| **ragService.js** | 938 | RAG implementation, Groq/OpenAI integration, document loading | Split by concern | **REFACTOR**: Too large; split into `ragService.js` (orchestration) + `aiProviderService.js` (LLM calls) + `documentLoaderService.js` (file loading) |
| **dataContextService.js** | 353 | Data parsing (CSV, Excel, SQLite), context building | dbService.js + utils | **REFACTOR**: Split into `dataContextService.js` (business logic) + `fileParserService.js` (CSV/Excel parsing) |
| **metricsService.js** | 526 | Interaction tracking, analytics, dashboard | Stand-alone | **KEEP**: Core business feature; properly scoped |
| **handoffService.js** | 411 | Agent handoff logic, case management | sessionService.js | **REVIEW**: Consider merging handoff logic into sessionService if tightly coupled |
| **sessionService.js** | 96 | Session management, message history | handoffService.js? | **KEEP**: Well-scoped; can pair with handoffService if merged |
| **nboService.js** | 52 | NBO recommendation algorithm | Integrate into server.js route or keep | **KEEP**: Small but cohesive; leave separate for future expansion |
| **dbService.js** | 64 | SQLite queries for customer data | db.js (merge) | **MERGE**: Combine with db.js into consolidated dbService.js |
| **appExperienceService.js** | 187 | Demo customer data (hardcoded) | Move to data/ | **REFACTOR**: Extract hardcoded data to `data/demoCustomers.json`; keep only query logic in service |
| **authService.js** | 69 | In-memory user authentication | Evaluate necessity | **REVIEW**: Prototype auth; evaluate if still needed or should be replaced |

**Services Consolidation Impact:**

High Priority (Definite Actions):
- Merge db.js → dbService.js (-143 lines)
- Split ragService.js (-938 + distributed)
- Split dataContextService.js (-353 + distributed)
- Extract appExperienceService.js data (-~100 lines to JSON file)

Medium Priority (Recommended):
- Review authService.js necessity
- Review handoffService.js/sessionService.js coupling

**Estimated Savings:** ~150-200 lines through merges + better organization through splits

---

## Detailed Consolidation Recommendations

### 🔴 HIGH PRIORITY - Remove/Delete

1. **backend/debug_rag.js** (10 lines)
   - Temporary debug code, not in test folder
   - **Action:** Delete
   - **Savings:** 10 lines

2. **backend/test_request.js** (26 lines)
   - Move to test folder as proper test or delete
   - **Action:** Move to `test/` or delete if redundant with other tests
   - **Savings:** 26 lines removed from root

3. **backend/test_chat.js** (36 lines)
   - Move to test folder as proper test or delete
   - **Action:** Move to `test/` or delete if redundant
   - **Savings:** 36 lines removed from root

4. **backend/scripts/inspect_xlsx.js** (24 lines)
   - One-time debug utility
   - **Action:** Archive to `deprecated/` or delete; document usage if needed
   - **Savings:** 24 lines

---

### 🟡 MEDIUM PRIORITY - Merge

1. **backend/db.js + services/dbService.js**
   - db.js: Database initialization, table creation, seeding
   - dbService.js: Database queries
   - **Action:** Merge into consolidated `services/dbService.js` with init function
   - **Savings:** 143 lines (consolidate initialization)
   - **Before:** 2 files managing DB concerns
   - **After:** 1 cohesive database service

2. **backend/scripts/import_csv_to_sqlite.js + import_xlsx_to_sqlite.js → cargarDatasetsDB.js**
   - Both import CSV/XLSX to SQLite; cargarDatasetsDB orchestrates
   - **Action:** Consolidate both import functions into cargarDatasetsDB.js
   - **Savings:** 90 lines (csv) + functionality folded
   - **Note:** Consider keeping separate if each is >150 lines or has distinct complexity

3. **backend/convertirData.js → backend/scripts/**
   - Small utility for data format transformation
   - **Action:** Move to `scripts/transformDataFormat.js` since it's active data processing
   - **Rationale:** Belongs with other data processing scripts
   - **Savings:** Cleaner root directory

---

### 🟠 REFACTOR/SPLIT (Large Files)

1. **backend/services/ragService.js** (938 lines - CRITICAL)
   - Currently handles: Groq SDK setup, document loading, prompt building, RAG queries, LLM calls
   - **Recommended Split:**
     - `ragService.js` (300-400 lines): Orchestration & RAG pipeline
     - `aiProviderService.js` (200-300 lines): Groq/OpenAI LLM calls
     - `documentLoaderService.js` (150-200 lines): File loading & preprocessing
     - `ragPromptService.js` (100-150 lines): Prompt building & formatting
   - **Savings:** Better maintainability, ~938 lines → distributed across focused services
   - **Impact:** ~40% reduction in largest file size

2. **backend/services/dataContextService.js** (353 lines)
   - Currently handles: File parsing (CSV/Excel/SQLite) + data context building
   - **Recommended Split:**
     - `dataContextService.js` (150-180 lines): Context building logic
     - `fileParserService.js` (150-180 lines): CSV/Excel/SQLite parsing utilities
   - **Rationale:** Parsing logic duplicates scripts/import_*.js; should be shared
   - **Impact:** ~50% reduction in file size, eliminates duplication

3. **backend/server.js** (892 lines)
   - Currently monolithic: Express setup, all route handlers, middleware
   - **Recommended Actions:**
     - Extract route registration → keep only in server.js
     - Move handlers to respective route files (routes/*, services/*)
     - Move middleware setup → separate `config/middleware.js`
   - **Impact:** server.js should be <200 lines; routes properly delegated

---

### 🟢 EXTRACT DATA (Remove Hardcoded Values)

1. **backend/services/appExperienceService.js** (187 lines)
   - Contains hardcoded customer demo data (~100+ lines as Map)
   - **Action:** Extract data to `backend/data/demoCustomers.json`
   - **Result:** appExperienceService.js (~90-100 lines) with just query logic
   - **Savings:** ~100 lines from service, better data separation

---

## Consolidation Implementation Plan

### Phase 1: Clean Up (Week 1) - NO FUNCTIONAL CHANGES
1. Delete `backend/debug_rag.js`
2. Move `backend/test_*.js` → `backend/test/` (rename as proper tests)
3. Move `backend/convertirData.js` → `backend/scripts/transformDataFormat.js`
4. Archive `backend/scripts/inspect_xlsx.js` to `deprecated/` or document

### Phase 2: Merge & Extract (Week 1-2) - LOW RISK
1. Merge `db.js` + `services/dbService.js` → consolidated `services/dbService.js`
2. Extract `appExperienceService.js` demo data → `data/demoCustomers.json`
3. Consolidate `scripts/import_csv_to_sqlite.js` into `cargarDatasetsDB.js`

### Phase 3: Refactor (Week 2-3) - HIGHER RISK, REQUIRES TESTING
1. Split `services/ragService.js` (938 → 300-400 across 3-4 files)
2. Split `services/dataContextService.js` (353 → 150-200 across 2 files)
3. Refactor `server.js` (892 → <200 lines)

### Phase 4: Consolidate Scripts (Week 3) - OPTIONAL
1. If viable, merge `import_xlsx_to_sqlite.js` into `cargarDatasetsDB.js`
2. Create `scripts/utils.js` for shared parsing logic

---

## Summary: Before vs. After

### Before Consolidation
```
Backend Files: 21 total
  - Root: 6 files (1,137 lines including tests/debug)
  - Routes: 2 files (81 lines) ✓
  - Scripts: 4 files (429 lines)
  - Services: 9 files (3,309 lines, largest: 938)
Total: ~4,918 lines
```

### After Consolidation (Estimated)
```
Backend Files: ~15-16 total (-5-6 files removed/merged)
  - Root: 2 files (500 lines) - server.js only
  - Routes: 2 files (81 lines) ✓
  - Scripts: 2-3 files (350 lines)
  - Services: 11-12 files (2,800-3,000 lines, largest: 300-400) ✓
Total: ~3,700-3,900 lines
~20% code reduction + better organization
```

### Key Improvements
| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| Largest file (lines) | 938 | 300-400 | -55% max file size |
| Root files | 6 | 2 | Clean root directory |
| Service count | 9 | 11-12 | Better separation of concerns |
| Total lines (approx) | 4,918 | 3,700-3,900 | -20% code reduction |
| Files to remove | 0 | 4 files | Cleaner codebase |

---

## Risk Assessment & Testing

| Action | Risk | Testing Required |
|--------|------|------------------|
| Delete debug_rag.js | 🟢 None | None |
| Move test files | 🟢 None | Verify test discovery |
| Move convertirData.js | 🟢 Low | Check imports, run data transform |
| Extract appExperienceService data | 🟡 Low | Integration test customer data loading |
| Merge db.js + dbService.js | 🟡 Medium | DB init tests, query tests |
| Consolidate import scripts | 🟡 Medium | CSV/XLSX import tests |
| Split ragService.js | 🔴 High | RAG pipeline tests, LLM provider tests |
| Split dataContextService.js | 🔴 High | Context building tests, file parsing tests |
| Refactor server.js | 🔴 High | Full API integration tests |

---

## Unused/Redundant Code Findings

### Potential Redundancy
1. **CSV Parsing Logic**
   - Exists in: `dataContextService.js` (parseDelimitedLine, parseDelimitedRows)
   - Also in: `scripts/cargarDatasetsDB.js` (similar CSV handling)
   - **Action:** Consolidate into shared `utils/fileParserUtils.js`

2. **Database Query Patterns**
   - Exists in: `dbService.js` (generic queries)
   - Also in: Multiple places in `ragService.js`
   - **Action:** Use dbService queries exclusively

3. **Session Context Management**
   - Exists in: `sessionService.js` (context update)
   - Coupled with: `handoffService.js` (case creation with context)
   - **Consideration:** Evaluate merge vs. current coupling

### Minimal-Use Files
1. **nboService.js** (52 lines) - Used in `routes/nbo.js`
   - Status: 🟢 Keep (cohesive, future expansion point)

2. **authService.js** (69 lines) - In-memory auth prototype
   - Status: 🟡 Review (might be unused or need replacement with real auth)

3. **appExperienceService.js** (187 lines) - Hardcoded demo data + queries
   - Status: 🟠 Refactor (extract data, keep logic)

---

## Recommended File Structure (Post-Consolidation)

```
backend/
├── server.js                         (200-250 lines) ← Refactored, minimal
├── package.json
├── .env (example)
│
├── routes/
│   ├── nbo.js                       (17 lines) ✓
│   └── webhook.js                   (64 lines) ✓
│
├── services/
│   ├── dbService.js                 (200-220 lines) ← Merged (db.js + dbService.js)
│   ├── sessionService.js            (96 lines) ✓
│   ├── handoffService.js            (411 lines) [consider merge with session]
│   ├── metricsService.js            (526 lines) ✓
│   ├── appExperienceService.js      (90-100 lines) ← Data extracted
│   ├── authService.js               (69 lines) [review necessity]
│   ├── nboService.js                (52 lines) ✓
│   ├── ragService.js                (300-400 lines) ← Split from 938
│   ├── aiProviderService.js         (200-300 lines) ← NEW [from ragService split]
│   ├── documentLoaderService.js     (150-200 lines) ← NEW [from ragService split]
│   ├── ragPromptService.js          (100-150 lines) ← NEW [from ragService split]
│   ├── dataContextService.js        (150-180 lines) ← Refactored/split
│   └── fileParserService.js         (150-180 lines) ← NEW [from dataContextService split]
│
├── scripts/
│   ├── cargarDatasetsDB.js          (200+ lines) ← Consolidated
│   ├── transformDataFormat.js       (34 lines) ← Moved from root
│   └── [import_*.js consolidated or archived]
│
├── data/
│   ├── demoCustomers.json           ← NEW [from appExperienceService]
│   ├── app.db
│   ├── recibos_demo.json
│   ├── *.csv files
│   └── Diccionario_de_datos.db
│
├── test/
│   ├── *.test.js
│   ├── chat.test.js                 ← Moved from root
│   └── requests.test.js             ← Moved from root
│
└── deprecated/                       ← Optional archive
    ├── inspect_xlsx.js              (24 lines) ← Archived
    └── README.md                    (documentation)
```

---

## Next Steps

1. **Review & Approve** this analysis with team
2. **Create feature branch** for Phase 1 cleanup
3. **Execute Phase 1** (remove/move files) - 1-2 days
4. **Execute Phase 2** (merge/extract) - 2-3 days, with testing
5. **Execute Phase 3** (refactor large files) - 3-5 days, with comprehensive testing
6. **Update documentation** (README, architecture notes)

---

**Generated:** 2026-08-12 | **Analyst:** Code Consolidation Review
