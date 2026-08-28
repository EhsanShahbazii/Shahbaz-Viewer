import React, { useState, useEffect, useMemo } from 'react';
import { TableInfo, ImportColumnDef, ImportOptions } from '../../../../src/common/messages';
import {
  parseCsv,
  parseJson,
  detectDelimiter,
  inferColumnDefs,
  ParseResult,
} from './importParser';

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: TableInfo[];
  activeTable?: string;
  onOpenFilePicker: () => void;
  selectedFileContent: { filename: string; content: string } | null;
  onExecuteImport: (options: ImportOptions) => void;
  isImporting: boolean;
  importResult: {
    success: boolean;
    count: number;
    tableName: string;
    error?: string;
  } | null;
}

type WizardStep = 1 | 2 | 3 | 4;

const SAMPLE_CSV = `name,email,role,credits,joined_at
Alice Chen,alice@example.com,engineer,1250,2025-01-15
Bob Martinez,bob@example.com,designer,820,2025-02-10
Charlie Kim,charlie@example.com,manager,2400,2025-03-01
Diana Prince,diana@example.com,director,3500,2025-03-12`;

const SAMPLE_JSON = `[
  { "sku": "PRD-101", "name": "Quantum Processor X", "price": 499.99, "in_stock": true, "rating": 4.8 },
  { "sku": "PRD-102", "name": "Ultra OLED Display", "price": 849.50, "in_stock": true, "rating": 4.9 },
  { "sku": "PRD-103", "name": "Mechanical Key Switch", "price": 89.00, "in_stock": false, "rating": 4.6 }
]`;

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  onClose,
  tables,
  activeTable,
  onOpenFilePicker,
  selectedFileContent,
  onExecuteImport,
  isImporting,
  importResult,
}) => {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: Input source state
  const [inputTab, setInputTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [format, setFormat] = useState<'auto' | 'csv' | 'json'>('auto');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [hasHeader, setHasHeader] = useState<boolean>(true);

  // Step 2: Destination state
  const [destMode, setDestMode] = useState<'new' | 'existing'>('new');
  const [targetTableName, setTargetTableName] = useState<string>('');
  const [conflictStrategy, setConflictStrategy] = useState<'fail' | 'replace' | 'ignore'>('ignore');

  // Step 3: Column mapping state
  const [columnDefs, setColumnDefs] = useState<ImportColumnDef[]>([]);

  // Parse result cache
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Synchronize when file is selected via host dialog
  useEffect(() => {
    if (selectedFileContent) {
      setFileName(selectedFileContent.filename);
      setFileContent(selectedFileContent.content);
      setInputTab('upload');

      // Auto-suggest table name from filename
      const baseName = selectedFileContent.filename
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase();
      if (!targetTableName) {
        setTargetTableName(baseName || 'imported_data');
      }
    }
  }, [selectedFileContent]);

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setParseError(null);
      if (activeTable && !targetTableName) {
        setTargetTableName(`imported_${activeTable}`);
      }
    }
  }, [isOpen]);

  // Active raw text based on tab
  const rawText = inputTab === 'upload' ? fileContent : pastedText;

  // Process and parse the raw text
  const handleParseData = (): boolean => {
    setParseError(null);
    if (!rawText || rawText.trim().length === 0) {
      setParseError('Please select a file or paste data to import.');
      return false;
    }

    let detectedFmt = format;
    if (detectedFmt === 'auto') {
      const trimmed = rawText.trim();
      detectedFmt = (trimmed.startsWith('[') || trimmed.startsWith('{')) ? 'json' : 'csv';
    }

    let result: ParseResult;
    if (detectedFmt === 'json') {
      result = parseJson(rawText);
    } else {
      result = parseCsv(rawText, delimiter, hasHeader);
    }

    if (result.error) {
      setParseError(result.error);
      return false;
    }

    if (result.rows.length === 0) {
      setParseError('No valid data records found in input.');
      return false;
    }

    setParsedData(result);

    // If destination table not set, guess from filename or default
    if (!targetTableName) {
      const guess = fileName ? fileName.replace(/\.[^.]+$/, '').toLowerCase() : 'imported_data';
      setTargetTableName(guess.replace(/[^a-zA-Z0-9_]/g, '_'));
    }

    // Infer column definitions
    const existingTable = destMode === 'existing'
      ? tables.find((t) => t.name === targetTableName)
      : undefined;

    const defs = inferColumnDefs(
      result.headers,
      result.rows,
      existingTable?.columns
    );
    setColumnDefs(defs);
    return true;
  };

  // Fallback HTML file picker for web/browser
  const handleHtmlFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFileContent(content);
        const baseName = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .toLowerCase();
        setTargetTableName(baseName);
      };
      reader.readAsText(file);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const ok = handleParseData();
      if (ok) {setStep(2);}
    } else if (step === 2) {
      if (!targetTableName || targetTableName.trim().length === 0) {
        setParseError('Target table name cannot be empty.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (columnDefs.filter((c) => !c.skip).length === 0) {
        setParseError('Please map at least one column for import.');
        return;
      }
      setStep(4);
    }
  };

  const handleBack = () => {
    setParseError(null);
    if (step > 1) {setStep((step - 1) as WizardStep);}
  };

  const handleFinalImport = () => {
    if (!parsedData || columnDefs.length === 0) {return;}

    onExecuteImport({
      mode: destMode,
      targetTable: targetTableName.trim(),
      conflictStrategy,
      columns: columnDefs,
      rows: parsedData.rows,
    });
  };

  if (!isOpen) {return null;}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in select-none">
      <div className="bg-vscode-bg border border-vscode-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-vscode-fg text-xs">
        {/* Modal Header */}
        <div className="h-12 border-b border-vscode-border bg-vscode-header px-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <span className="codicon codicon-cloud-upload text-vscode-info text-base"></span>
            <span>Import Wizard (CSV & JSON)</span>
          </div>

          {/* Stepper Progress Badges */}
          <div className="flex items-center gap-2">
            {[
              { num: 1, label: 'Source' },
              { num: 2, label: 'Destination' },
              { num: 3, label: 'Mapping' },
              { num: 4, label: 'Preview' },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  step === s.num
                    ? 'bg-vscode-button text-vscode-buttonFg'
                    : step > s.num
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-vscode-fg/50'
                }`}
              >
                <span>{step > s.num ? '✓' : s.num}.</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-1 text-vscode-fg/70 hover:text-vscode-fg hover:bg-vscode-list-hoverBg rounded transition-colors"
          >
            <span className="codicon codicon-close text-sm"></span>
          </button>
        </div>

        {/* Modal Body according to Step */}
        <div className="flex-1 overflow-y-auto p-5">
          {parseError && (
            <div className="mb-4 p-3 bg-red-500/15 border border-red-500/40 rounded-lg text-xs text-red-300 flex items-center gap-2">
              <span className="codicon codicon-warning text-red-400"></span>
              <span>{parseError}</span>
            </div>
          )}

          {/* STEP 1: SELECT INPUT SOURCE */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Tab Selector: Upload File vs Paste Text */}
              <div className="flex items-center gap-2 border-b border-vscode-border pb-2">
                <button
                  onClick={() => setInputTab('upload')}
                  className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors ${
                    inputTab === 'upload'
                      ? 'bg-vscode-secondaryBtn text-vscode-secondaryBtnFg'
                      : 'text-vscode-fg/70 hover:text-vscode-fg'
                  }`}
                >
                  <span className="codicon codicon-folder-opened"></span>
                  <span>Upload File</span>
                </button>
                <button
                  onClick={() => setInputTab('paste')}
                  className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors ${
                    inputTab === 'paste'
                      ? 'bg-vscode-secondaryBtn text-vscode-secondaryBtnFg'
                      : 'text-vscode-fg/70 hover:text-vscode-fg'
                  }`}
                >
                  <span className="codicon codicon-edit"></span>
                  <span>Paste Raw Data</span>
                </button>
              </div>

              {inputTab === 'upload' ? (
                <div className="space-y-3">
                  {/* File drop / select container */}
                  <div className="border-2 border-dashed border-vscode-border hover:border-vscode-focusBorder rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-vscode-header/30 transition-colors text-center">
                    <span className="codicon codicon-cloud-upload text-4xl text-vscode-info opacity-70"></span>
                    <div>
                      <div className="font-semibold text-sm">
                        {fileName ? fileName : 'Select a CSV or JSON file to import'}
                      </div>
                      <div className="text-vscode-fg/60 text-xs mt-0.5">
                        Supports .csv, .tsv, .json, .ndjson (JSON Lines)
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={onOpenFilePicker}
                        className="px-4 py-1.5 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <span className="codicon codicon-search"></span>
                        <span>Browse with VS Code...</span>
                      </button>

                      {/* Native HTML fallback file input */}
                      <label className="px-3 py-1.5 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded font-medium cursor-pointer transition-colors">
                        <span>Local Browser File</span>
                        <input
                          type="file"
                          accept=".csv,.tsv,.json,.ndjson,.txt"
                          onChange={handleHtmlFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {fileContent && (
                    <div className="p-3 bg-vscode-header/50 border border-vscode-border rounded-lg flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-check text-emerald-400"></span>
                        <span>
                          Loaded <span className="font-semibold text-vscode-fg">{fileName}</span> ({Math.round(fileContent.length / 1024)} KB)
                        </span>
                      </div>
                      <span className="text-vscode-fg/60 font-mono">
                        ~{fileContent.split('\n').length} lines
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-vscode-fg/70 font-medium">
                      Paste CSV or JSON Content:
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-vscode-fg/50">Try sample:</span>
                      <button
                        onClick={() => {
                          setPastedText(SAMPLE_CSV);
                          setFormat('csv');
                        }}
                        className="underline hover:text-vscode-fg"
                      >
                        CSV
                      </button>
                      <button
                        onClick={() => {
                          setPastedText(SAMPLE_JSON);
                          setFormat('json');
                        }}
                        className="underline hover:text-vscode-fg"
                      >
                        JSON
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste CSV rows or JSON array here..."
                    className="w-full h-48 bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded p-3 text-xs font-mono outline-none focus:border-vscode-focusBorder resize-none leading-relaxed"
                  />
                </div>
              )}

              {/* Format & Parsing Controls */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-vscode-header/40 border border-vscode-border rounded-lg">
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Format:
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1 outline-none"
                  >
                    <option value="auto">Auto-Detect</option>
                    <option value="csv">CSV / TSV</option>
                    <option value="json">JSON Array / Lines</option>
                  </select>
                </div>

                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Delimiter:
                  </label>
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1 outline-none"
                  >
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value="&#9;">Tab (\t)</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-vscode-fg/80">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                      className="rounded"
                    />
                    <span>First row has headers</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DESTINATION TABLE & CONFLICT STRATEGY */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-vscode-fg/70 font-semibold">
                  Import Destination:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setDestMode('new');
                      if (!targetTableName || tables.some((t) => t.name === targetTableName)) {
                        setTargetTableName(`imported_${Date.now().toString().slice(-4)}`);
                      }
                    }}
                    className={`p-4 border rounded-xl text-left transition-all ${
                      destMode === 'new'
                        ? 'bg-vscode-button/10 border-vscode-button text-vscode-fg shadow-sm'
                        : 'border-vscode-border hover:bg-vscode-list-hoverBg text-vscode-fg/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-vscode-fg mb-1">
                      <span className="codicon codicon-add text-vscode-info"></span>
                      <span>Create New Table</span>
                    </div>
                    <div className="text-xs text-vscode-fg/60">
                      Creates a brand new SQLite table automatically with inferred column types.
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setDestMode('existing');
                      if (tables.length > 0 && !tables.some((t) => t.name === targetTableName)) {
                        setTargetTableName(tables[0].name);
                      }
                    }}
                    className={`p-4 border rounded-xl text-left transition-all ${
                      destMode === 'existing'
                        ? 'bg-vscode-button/10 border-vscode-button text-vscode-fg shadow-sm'
                        : 'border-vscode-border hover:bg-vscode-list-hoverBg text-vscode-fg/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-vscode-fg mb-1">
                      <span className="codicon codicon-database text-vscode-info"></span>
                      <span>Append to Existing Table</span>
                    </div>
                    <div className="text-xs text-vscode-fg/60">
                      Appends imported records into an existing table in this database.
                    </div>
                  </button>
                </div>
              </div>

              {/* Table Name Picker / Input */}
              <div className="p-4 bg-vscode-header/40 border border-vscode-border rounded-xl space-y-3">
                {destMode === 'new' ? (
                  <div>
                    <label className="block text-vscode-fg/70 font-medium mb-1">
                      New Table Name:
                    </label>
                    <input
                      type="text"
                      value={targetTableName}
                      onChange={(e) => setTargetTableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))}
                      placeholder="e.g. imported_orders"
                      className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-3 py-1.5 outline-none font-mono focus:border-vscode-focusBorder"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-vscode-fg/70 font-medium mb-1">
                      Select Target Table:
                    </label>
                    <select
                      value={targetTableName}
                      onChange={(e) => setTargetTableName(e.target.value)}
                      className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-3 py-1.5 outline-none font-medium"
                    >
                      {tables.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} ({t.rowCount.toLocaleString()} rows, {t.columns.length} columns)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Conflict Resolution Strategy */}
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    On Constraint Conflict (e.g. duplicate Primary Key):
                  </label>
                  <select
                    value={conflictStrategy}
                    onChange={(e) => setConflictStrategy(e.target.value as any)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-3 py-1.5 outline-none"
                  >
                    <option value="ignore">INSERT OR IGNORE (Skip duplicates quietly)</option>
                    <option value="replace">INSERT OR REPLACE (Overwrite existing records)</option>
                    <option value="fail">INSERT INTO (Fail and abort transaction on error)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: COLUMN MAPPING & TYPE ASSIGNMENT */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-vscode-fg/70">
                <span>
                  Map incoming file columns to SQLite schema columns and types:
                </span>
                <span className="font-mono">
                  {columnDefs.filter((c) => !c.skip).length} of {columnDefs.length} active
                </span>
              </div>

              <div className="border border-vscode-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-vscode-header border-b border-vscode-border text-vscode-fg/70 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="p-2 w-10 text-center">Skip</th>
                      <th className="p-2">Source Field</th>
                      <th className="p-2">Target Column Name</th>
                      <th className="p-2">Data Type</th>
                      <th className="p-2 w-20 text-center">Primary Key</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vscode-border/50 font-mono">
                    {columnDefs.map((col, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-vscode-list-hoverBg transition-colors ${
                          col.skip ? 'opacity-40 line-through' : ''
                        }`}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={col.skip}
                            onChange={(e) => {
                              const next = [...columnDefs];
                              next[idx].skip = e.target.checked;
                              setColumnDefs(next);
                            }}
                          />
                        </td>
                        <td className="p-2 font-semibold text-vscode-fg">
                          {col.sourceName}
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={col.targetName}
                            disabled={col.skip}
                            onChange={(e) => {
                              const next = [...columnDefs];
                              next[idx].targetName = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_');
                              setColumnDefs(next);
                            }}
                            className="w-full bg-vscode-inputBg border border-vscode-inputBorder rounded px-2 py-0.5 text-xs text-vscode-inputFg outline-none font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={col.type}
                            disabled={col.skip}
                            onChange={(e) => {
                              const next = [...columnDefs];
                              next[idx].type = e.target.value;
                              setColumnDefs(next);
                            }}
                            className="bg-vscode-inputBg border border-vscode-inputBorder rounded px-2 py-0.5 text-xs text-vscode-inputFg outline-none"
                          >
                            <option value="INTEGER">INTEGER</option>
                            <option value="REAL">REAL (Float)</option>
                            <option value="TEXT">TEXT (String)</option>
                            <option value="BOOLEAN">BOOLEAN</option>
                            <option value="DATETIME">DATETIME</option>
                            <option value="BLOB">BLOB</option>
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={col.isPk || false}
                            disabled={col.skip || destMode === 'existing'}
                            onChange={(e) => {
                              const next = columnDefs.map((c, i) => ({
                                ...c,
                                isPk: i === idx ? e.target.checked : false,
                              }));
                              setColumnDefs(next);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW & CONFIRMATION */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-vscode-header/50 border border-vscode-border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-vscode-button/15 flex items-center justify-center text-vscode-button">
                    <span className="codicon codicon-check text-lg"></span>
                  </div>
                  <div>
                    <div className="font-semibold text-vscode-fg">
                      Ready to import {parsedData?.totalRows.toLocaleString()} rows into &quot;{targetTableName}&quot;
                    </div>
                    <div className="text-vscode-fg/60 text-[11px] mt-0.5">
                      Destination: <span className="font-mono text-vscode-info">{destMode === 'new' ? 'New Table' : 'Append to Existing'}</span> | Conflict: <span className="font-mono">{conflictStrategy}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sample Data Table Preview */}
              <div>
                <div className="text-vscode-fg/70 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Sample Data Preview (First 8 rows):</span>
                  <span className="font-mono text-[11px]">{parsedData?.totalRows.toLocaleString()} total records</span>
                </div>

                <div className="border border-vscode-border rounded-xl overflow-hidden max-h-56 overflow-x-auto overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-vscode-header border-b border-vscode-border sticky top-0 z-10">
                      <tr>
                        {columnDefs
                          .filter((c) => !c.skip)
                          .map((col, idx) => (
                            <th key={idx} className="p-2 font-mono text-[11px] text-vscode-fg/80 border-r border-vscode-border/50 last:border-0">
                              <div>{col.targetName}</div>
                              <div className="text-[9px] text-vscode-info font-normal">{col.type}</div>
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-vscode-border/40 font-mono text-[11px]">
                      {parsedData?.rows.slice(0, 8).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-vscode-list-hoverBg">
                          {columnDefs
                            .filter((c) => !c.skip)
                            .map((col, cIdx) => (
                              <td key={cIdx} className="p-2 border-r border-vscode-border/30 last:border-0 truncate max-w-[150px]">
                                {row[col.sourceName] === null || row[col.sourceName] === undefined ? (
                                  <span className="text-vscode-fg/30 italic">NULL</span>
                                ) : (
                                  String(row[col.sourceName])
                                )}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="h-14 border-t border-vscode-border bg-vscode-header/50 px-5 flex items-center justify-between flex-shrink-0">
          <div>
            {step > 1 && (
              <button
                onClick={handleBack}
                disabled={isImporting}
                className="px-3.5 py-1.5 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded font-medium transition-colors"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-3.5 py-1.5 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded font-medium transition-colors"
            >
              Cancel
            </button>

            {step < 4 ? (
              <button
                onClick={handleNext}
                className="px-4 py-1.5 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>Continue</span>
                <span className="codicon codicon-arrow-right"></span>
              </button>
            ) : (
              <button
                onClick={handleFinalImport}
                disabled={isImporting}
                className="px-5 py-1.5 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded font-semibold flex items-center gap-2 transition-colors shadow-md disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <span className="codicon codicon-loading codicon-modifier-spin"></span>
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span className="codicon codicon-database"></span>
                    <span>Import {parsedData?.totalRows.toLocaleString()} Records</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
