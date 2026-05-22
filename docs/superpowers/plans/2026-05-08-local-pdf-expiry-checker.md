# Local PDF Expiry Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost web app where users upload a bookmark-structured PDF, choose a cutoff date, and receive certificate expiry findings with OCR evidence.

**Architecture:** A Python standard-library HTTP server hosts the audit workbench UI and job API. The Python core parses OCR text and applies expiry filtering; a Swift helper uses PDFKit and Vision to extract outlines and OCR certificate pages on macOS.

**Tech Stack:** Python 3 standard library, unittest, macOS Swift with PDFKit/Vision/AppKit, HTML/CSS/vanilla JavaScript.

---

### Task 1: Core Validity Extraction

**Files:**
- Create: `src/pdf_expiry_checker/__init__.py`
- Create: `src/pdf_expiry_checker/extractor.py`
- Test: `tests/test_validity_extraction.py`

- [ ] **Step 1: Write failing parser tests**
- [ ] **Step 2: Run `PYTHONPATH=src python3 -m unittest tests/test_validity_extraction.py` and verify import failure**
- [ ] **Step 3: Implement date and validity extraction**
- [ ] **Step 4: Re-run unit tests and verify pass**

### Task 2: Swift PDF/OCR Helper

**Files:**
- Create: `swift/pdf_audit.swift`
- Create: `src/pdf_expiry_checker/runner.py`

- [ ] **Step 1: Port the verified PDFKit/Vision OCR flow into a reusable Swift CLI**
- [ ] **Step 2: Add Python runner wrapper that creates job directories and invokes Swift**
- [ ] **Step 3: Smoke test the runner against `~/Documents/123.pdf`**

### Task 3: Local Web Service

**Files:**
- Create: `src/pdf_expiry_checker/server.py`
- Create: `run_local.py`

- [ ] **Step 1: Implement localhost HTTP server with upload, status, result, and download routes**
- [ ] **Step 2: Ensure uploaded files stay under per-job local directories**
- [ ] **Step 3: Stream progress states from job metadata**

### Task 4: Audit Workbench UI

**Files:**
- Create: `static/index.html`
- Create: `static/styles.css`
- Create: `static/app.js`

- [ ] **Step 1: Build the workbench layout: input sidebar, status cards, result tabs, evidence tables**
- [ ] **Step 2: Wire upload and polling to the local API**
- [ ] **Step 3: Add CSV/JSON download controls and error states**

### Task 5: End-to-End Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run unit tests**
- [ ] **Step 2: Start local server and run a real job against `~/Documents/123.pdf`**
- [ ] **Step 3: Verify result count is zero for cutoff `2026-05-22`, with near-expiry rows visible**
- [ ] **Step 4: Document startup commands and macOS requirements**
