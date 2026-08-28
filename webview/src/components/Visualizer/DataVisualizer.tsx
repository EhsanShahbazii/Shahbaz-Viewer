import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TableInfo, ColumnInfo } from '../../../../src/common/messages';
import { getVsCodeApi } from '../../hooks/useVsCode';
import {
  ChartRenderer,
  ChartType,
  ChartDataItem,
} from './ChartRenderer';
import {
  ColorPaletteName,
  COLOR_PALETTES,
  exportSvgToFile,
  exportSvgToPng,
  formatMetricNumber,
} from './chartUtils';
import { getExportThemeColors } from '../../utils/theme';
import { insertTimestamp } from '../../utils/timestamp';

interface DataVisualizerProps {
  tables: TableInfo[];
  views: TableInfo[];
  activeTable: string;
  onSelectTable: (tableName: string) => void;
  onExecuteQuery: (query: string, chartId?: string) => void;
  chartQueryResult: {
    query: string;
    columns: string[];
    rows: any[];
    durationMs: number;
    error?: string;
    chartId?: string;
  } | null;
  onOpenInSqlStudio?: (query: string) => void;
}

interface ChartPreset {
  id: string;
  label: string;
  icon: string;
  chartType: ChartType;
  xCol: string;
  yCol?: string;
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'RAW';
  dateGrouping?: 'none' | 'day' | 'month' | 'year';
  sortOrder?: 'desc' | 'asc' | 'alphaAsc';
}

export const DataVisualizer: React.FC<DataVisualizerProps> = ({
  tables,
  views,
  activeTable,
  onSelectTable,
  onExecuteQuery,
  chartQueryResult,
  onOpenInSqlStudio,
}) => {
  const allTables = useMemo(() => [...tables, ...views], [tables, views]);

  // Mode: Table vs Custom SQL
  const [dataSourceMode, setDataSourceMode] = useState<'table' | 'query'>('table');
  const [selectedTableName, setSelectedTableName] = useState<string>(activeTable || (tables[0]?.name || ''));

  // Visualizer configurations
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisCol, setXAxisCol] = useState<string>('');
  const [yAxisCol, setYAxisCol] = useState<string>('');
  const [aggregation, setAggregation] = useState<'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'RAW'>('COUNT');
  const [limit, setLimit] = useState<number>(15);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'alphaAsc' | 'alphaDesc'>('desc');
  const [dateGrouping, setDateGrouping] = useState<'none' | 'day' | 'month' | 'year'>('none');
  const [palette, setPalette] = useState<ColorPaletteName>('vscode');
  const [showDataLabels, setShowDataLabels] = useState<boolean>(true);
  const [showGridLines, setShowGridLines] = useState<boolean>(true);
  const [smoothCurve, setSmoothCurve] = useState<boolean>(true);

  // Custom SQL Mode state
  const [customSql, setCustomSql] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Current active table schema info
  const currentTable = useMemo(() => {
    return allTables.find((t) => t.name === selectedTableName) || allTables[0];
  }, [allTables, selectedTableName]);

  const columns: ColumnInfo[] = currentTable?.columns || [];

  // Categorize columns: Numeric vs Categorical vs Date/Time
  const { numericCols, textCols, dateCols } = useMemo(() => {
    const num: ColumnInfo[] = [];
    const txt: ColumnInfo[] = [];
    const dat: ColumnInfo[] = [];

    columns.forEach((col) => {
      const type = (col.type || '').toUpperCase();
      const name = col.name.toLowerCase();

      if (
        name.includes('date') ||
        name.includes('time') ||
        name.endsWith('_at') ||
        type.includes('TIME') ||
        type.includes('DATE')
      ) {
        dat.push(col);
      }
      if (
        type.includes('INT') ||
        type.includes('REAL') ||
        type.includes('FLOAT') ||
        type.includes('DOUBLE') ||
        type.includes('NUMERIC') ||
        type.includes('DECIMAL')
      ) {
        num.push(col);
      } else {
        txt.push(col);
      }
    });

    return { numericCols: num, textCols: txt, dateCols: dat };
  }, [columns]);

  // Keep selectedTable in sync with external activeTable
  useEffect(() => {
    if (activeTable && activeTable !== selectedTableName) {
      setSelectedTableName(activeTable);
    }
  }, [activeTable]);

  // Auto-initialize X and Y columns when table changes
  // Reset settings to automatic smart defaults
  const resetToDefaults = () => {
    try {
      localStorage.removeItem(`sql_viewer_chart_settings_${selectedTableName}`);
    } catch {}

    const defaultX =
      textCols.find((c) => c.name !== 'id' && c.name !== 'uuid') ||
      dateCols[0] ||
      columns[1] ||
      columns[0];

    const defaultY =
      numericCols.find((c) => !c.name.toLowerCase().endsWith('_id') && c.name !== 'id') ||
      numericCols[0] ||
      columns[0];

    if (defaultX) {setXAxisCol(defaultX.name);}
    if (defaultY) {setYAxisCol(defaultY.name);}

    if (dateCols.some((d) => d.name === defaultX?.name)) {
      setChartType('line');
      setDateGrouping('month');
      setSortOrder('alphaAsc');
    } else {
      setChartType('bar');
      setDateGrouping('none');
      setSortOrder('desc');
    }
    setAggregation('COUNT');
    setLimit(15);
    setPalette('vscode');
    setShowDataLabels(true);
    setShowGridLines(true);
    setSmoothCurve(true);
    showToast('Reset chart settings to default');
  };

  // Restore saved chart settings or fall back to defaults
  useEffect(() => {
    if (columns.length === 0) {return;}

    try {
      const saved = localStorage.getItem(`sql_viewer_chart_settings_${selectedTableName}`);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.chartType) {setChartType(config.chartType);}
        if (config.xAxisCol && columns.some((c) => c.name === config.xAxisCol)) {
          setXAxisCol(config.xAxisCol);
        }
        if (config.yAxisCol && columns.some((c) => c.name === config.yAxisCol)) {
          setYAxisCol(config.yAxisCol);
        }
        if (config.aggregation) {setAggregation(config.aggregation);}
        if (config.limit) {setLimit(config.limit);}
        if (config.sortOrder) {setSortOrder(config.sortOrder);}
        if (config.dateGrouping) {setDateGrouping(config.dateGrouping);}
        if (config.palette) {setPalette(config.palette);}
        if (config.showDataLabels !== undefined) {setShowDataLabels(config.showDataLabels);}
        if (config.showGridLines !== undefined) {setShowGridLines(config.showGridLines);}
        if (config.smoothCurve !== undefined) {setSmoothCurve(config.smoothCurve);}
        return;
      }
    } catch {}

    resetToDefaults();
  }, [selectedTableName]);

  // Auto-save settings whenever settings change
  useEffect(() => {
    if (!selectedTableName || !xAxisCol) {return;}
    try {
      const config = {
        chartType,
        xAxisCol,
        yAxisCol,
        aggregation,
        limit,
        sortOrder,
        dateGrouping,
        palette,
        showDataLabels,
        showGridLines,
        smoothCurve,
      };
      localStorage.setItem(`sql_viewer_chart_settings_${selectedTableName}`, JSON.stringify(config));
    } catch {}
  }, [
    selectedTableName,
    chartType,
    xAxisCol,
    yAxisCol,
    aggregation,
    limit,
    sortOrder,
    dateGrouping,
    palette,
    showDataLabels,
    showGridLines,
    smoothCurve,
  ]);

  // Compute Smart Presets based on table schema
  const presets: ChartPreset[] = useMemo(() => {
    if (!currentTable) {return [];}
    const result: ChartPreset[] = [];
    const colNames = columns.map((c) => c.name.toLowerCase());

    // 1. Status distribution
    const statusCol = columns.find((c) => c.name.toLowerCase().includes('status') || c.name.toLowerCase() === 'role' || c.name.toLowerCase() === 'tier');
    if (statusCol) {
      result.push({
        id: 'status_donut',
        label: `${statusCol.name.toUpperCase()} Breakdown`,
        icon: 'codicon-pie-chart',
        chartType: 'donut',
        xCol: statusCol.name,
        aggregation: 'COUNT',
        sortOrder: 'desc',
      });
    }

    // 2. Date / Timeline trend
    const dateCol = dateCols[0] || columns.find((c) => c.name.toLowerCase().includes('created') || c.name.toLowerCase().includes('date'));
    if (dateCol) {
      result.push({
        id: 'timeline_line',
        label: `${dateCol.name} Timeline`,
        icon: 'codicon-graph-line',
        chartType: 'area',
        xCol: dateCol.name,
        aggregation: 'COUNT',
        dateGrouping: 'month',
        sortOrder: 'alphaAsc',
      });
    }

    // 3. Top Value / Financial / Metric ranking
    const valCol = numericCols.find((c) =>
      ['total_amount', 'price', 'balance', 'credit_limit', 'revenue', 'spending', 'cost'].some((k) =>
        c.name.toLowerCase().includes(k)
      )
    );
    const catCol = columns.find((c) => ['name', 'company_name', 'title', 'sku', 'category_name', 'username'].includes(c.name.toLowerCase())) || textCols[0];
    if (valCol && catCol) {
      result.push({
        id: 'top_values',
        label: `Top by ${valCol.name}`,
        icon: 'codicon-graph-bar',
        chartType: 'horizontalBar',
        xCol: catCol.name,
        yCol: valCol.name,
        aggregation: 'SUM',
        sortOrder: 'desc',
      });
    }

    // 4. Rating distribution
    const ratingCol = columns.find((c) => c.name.toLowerCase().includes('rating'));
    if (ratingCol) {
      result.push({
        id: 'rating_dist',
        label: 'Ratings Distribution',
        icon: 'codicon-star',
        chartType: 'bar',
        xCol: ratingCol.name,
        aggregation: 'COUNT',
        sortOrder: 'alphaAsc',
      });
    }

    // 5. Correlation / Scatter plot
    if (numericCols.length >= 2) {
      result.push({
        id: 'scatter_corr',
        label: `${numericCols[0].name} vs ${numericCols[1].name}`,
        icon: 'codicon-symbol-misc',
        chartType: 'scatter',
        xCol: numericCols[0].name,
        yCol: numericCols[1].name,
        aggregation: 'RAW',
      });
    }

    return result;
  }, [currentTable, columns, numericCols, textCols, dateCols]);

  // Build and execute the SQL query whenever settings change
  const currentQuery = useMemo(() => {
    if (dataSourceMode === 'query') {
      return customSql;
    }

    if (!selectedTableName || !xAxisCol) {
      return '';
    }

    // Handle Scatter Plot (Raw two numeric columns)
    if (chartType === 'scatter') {
      const labelCol = textCols[0]?.name || 'id';
      const xMetric = xAxisCol;
      const yMetric = yAxisCol || numericCols[1]?.name || numericCols[0]?.name || 'id';
      return `SELECT "${labelCol}" AS label, "${xMetric}" AS secondary_val, "${yMetric}" AS metric\nFROM "${selectedTableName}"\nWHERE "${xMetric}" IS NOT NULL AND "${yMetric}" IS NOT NULL\nLIMIT ${limit};`;
    }

    // Handle Date Truncation
    let xExpr = `"${xAxisCol}"`;
    if (dateGrouping === 'day') {
      xExpr = `strftime('%Y-%m-%d', "${xAxisCol}")`;
    } else if (dateGrouping === 'month') {
      xExpr = `strftime('%Y-%m', "${xAxisCol}")`;
    } else if (dateGrouping === 'year') {
      xExpr = `strftime('%Y', "${xAxisCol}")`;
    }

    // Handle Metric / Aggregation
    let metricExpr = 'COUNT(*)';
    if (aggregation === 'SUM' && yAxisCol) {
      metricExpr = `SUM("${yAxisCol}")`;
    } else if (aggregation === 'AVG' && yAxisCol) {
      metricExpr = `ROUND(AVG("${yAxisCol}"), 2)`;
    } else if (aggregation === 'MIN' && yAxisCol) {
      metricExpr = `MIN("${yAxisCol}")`;
    } else if (aggregation === 'MAX' && yAxisCol) {
      metricExpr = `MAX("${yAxisCol}")`;
    } else if (aggregation === 'RAW' && yAxisCol) {
      return `SELECT ${xExpr} AS category, "${yAxisCol}" AS metric\nFROM "${selectedTableName}"\nWHERE ${xExpr} IS NOT NULL\nLIMIT ${limit};`;
    }

    // Sorting
    let orderClause = 'ORDER BY metric DESC';
    if (sortOrder === 'asc') {
      orderClause = 'ORDER BY metric ASC';
    } else if (sortOrder === 'alphaAsc') {
      orderClause = 'ORDER BY category ASC';
    } else if (sortOrder === 'alphaDesc') {
      orderClause = 'ORDER BY category DESC';
    }

    return `SELECT ${xExpr} AS category, ${metricExpr} AS metric\nFROM "${selectedTableName}"\nWHERE ${xExpr} IS NOT NULL\nGROUP BY category\n${orderClause}\nLIMIT ${limit};`;
  }, [
    dataSourceMode,
    customSql,
    selectedTableName,
    xAxisCol,
    yAxisCol,
    aggregation,
    chartType,
    dateGrouping,
    sortOrder,
    limit,
    textCols,
    numericCols,
  ]);

  // Execute SQL when query definition changes
  useEffect(() => {
    if (currentQuery && currentQuery.trim().length > 0) {
      onExecuteQuery(currentQuery, 'visualizer');
    }
  }, [currentQuery]);

  // Transform queryResult rows into ChartDataItem[]
  const chartData: ChartDataItem[] = useMemo(() => {
    if (!chartQueryResult || !chartQueryResult.rows || chartQueryResult.rows.length === 0) {
      return [];
    }

    // Performance guard: cap data points to 500 to keep SVG rendering smooth and responsive
    const rows = chartQueryResult.rows.length > 500
      ? chartQueryResult.rows.slice(0, 500)
      : chartQueryResult.rows;

    return rows.map((row, idx) => {
      let label = '';
      let val = 0;
      let secVal: number | undefined = undefined;

      if (row.category !== undefined) {
        label = row.category === null ? '(Null)' : String(row.category);
      } else if (row.label !== undefined) {
        label = String(row.label);
      } else {
        const keys = Object.keys(row);
        label = String(row[keys[0]] ?? `Item ${idx + 1}`);
      }

      if (row.metric !== undefined) {
        val = Number(row.metric) || 0;
      } else if (row.value !== undefined) {
        val = Number(row.value) || 0;
      } else {
        const keys = Object.keys(row);
        const secondKey = keys.find((k) => typeof row[k] === 'number') || keys[1];
        val = Number(row[secondKey]) || 0;
      }

      if (row.secondary_val !== undefined) {
        secVal = Number(row.secondary_val) || 0;
      }

      return {
        label,
        value: val,
        secondaryValue: secVal,
        raw: row,
      };
    });
  }, [chartQueryResult]);

  // Quick preset applicator
  const handleApplyPreset = (preset: ChartPreset) => {
    setChartType(preset.chartType);
    setXAxisCol(preset.xCol);
    if (preset.yCol) {setYAxisCol(preset.yCol);}
    setAggregation(preset.aggregation);
    if (preset.dateGrouping) {setDateGrouping(preset.dateGrouping);}
    if (preset.sortOrder) {setSortOrder(preset.sortOrder);}
  };

  // Toast feedback helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Copy SQL query to clipboard
  const handleCopySql = () => {
    if (!currentQuery) {return;}
    navigator.clipboard.writeText(currentQuery);
    showToast('SQL Query copied to clipboard!');
  };

  // Export handlers
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 450;

    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const origElements = svgRef.current.querySelectorAll('*');
    const cloneElements = clone.querySelectorAll('*');
    origElements.forEach((origEl, i) => {
      const cloneEl = cloneElements[i] as HTMLElement;
      if (!cloneEl) return;
      const comp = window.getComputedStyle(origEl);
      if (comp.fill && comp.fill !== 'none') {
        cloneEl.setAttribute('fill', comp.fill);
      }
      if (comp.stroke && comp.stroke !== 'none') {
        cloneEl.setAttribute('stroke', comp.stroke);
      }
      cloneEl.style.fontFamily = comp.fontFamily || 'system-ui, -apple-system, sans-serif';
      cloneEl.style.fontSize = comp.fontSize;
      cloneEl.style.fontWeight = comp.fontWeight;
    });

    const colors = getExportThemeColors();
    // Add theme-synced solid background rect to SVG
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', colors.canvasBg);
    clone.insertBefore(bgRect, clone.firstChild);

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clone);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+width=/)) {
      source = source.replace(/^<svg/, `<svg width="${width}" height="${height}"`);
    }

    getVsCodeApi().postMessage({
      type: 'exportImage',
      payload: {
        fileName: insertTimestamp(`${selectedTableName}_chart.svg`),
        format: 'svg',
        svgString: source,
      },
    });
    showToast('Saving SVG to project folder...');
  };

  const handleExportPng = () => {
    if (!svgRef.current) return;
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 450;

    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const origElements = svgRef.current.querySelectorAll('*');
    const cloneElements = clone.querySelectorAll('*');
    origElements.forEach((origEl, i) => {
      const cloneEl = cloneElements[i] as HTMLElement;
      if (!cloneEl) return;
      const comp = window.getComputedStyle(origEl);
      if (comp.fill && comp.fill !== 'none') {
        cloneEl.setAttribute('fill', comp.fill);
      }
      if (comp.stroke && comp.stroke !== 'none') {
        cloneEl.setAttribute('stroke', comp.stroke);
      }
      cloneEl.style.fontFamily = comp.fontFamily || 'system-ui, -apple-system, sans-serif';
      cloneEl.style.fontSize = comp.fontSize;
      cloneEl.style.fontWeight = comp.fontWeight;
    });

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clone);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+width=/)) {
      source = source.replace(/^<svg/, `<svg width="${width}" height="${height}"`);
    }

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const colors = getExportThemeColors();
          ctx.scale(scale, scale);
          ctx.fillStyle = colors.canvasBg;
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const base64Data = canvas.toDataURL('image/png');
          getVsCodeApi().postMessage({
            type: 'exportImage',
            payload: {
              fileName: insertTimestamp(`${selectedTableName}_chart.png`),
              format: 'png',
              base64Data,
            },
          });
          showToast('Saved PNG to project folder!');
        }
      } catch (err) {
        console.error('Canvas export error:', err);
        showToast('PNG conversion error');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = (err) => {
      console.error('Image load error for PNG export:', err);
      URL.revokeObjectURL(url);
      showToast('Could not convert SVG to PNG');
    };
    img.src = url;
  };

  // Stats summary for the top bar
  const stats = useMemo(() => {
    const total = chartData.reduce((acc, d) => acc + d.value, 0);
    const avg = chartData.length > 0 ? total / chartData.length : 0;
    const max = chartData.reduce((m, d) => (d.value > m ? d.value : m), -Infinity);
    return {
      total,
      avg,
      max: max === -Infinity ? 0 : max,
      count: chartData.length,
    };
  }, [chartData]);

  return (
    <div className="w-full h-full flex flex-col bg-vscode-bg text-vscode-fg select-none overflow-hidden">
      {/* Visualizer Top Control Bar */}
      <div className="border-b border-vscode-border bg-vscode-header px-4 py-2 flex items-center justify-between gap-3 flex-wrap flex-shrink-0 z-20">
        {/* Left Side: Source Selector, Table Picker & Chart Types */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Source Mode Toggle */}
          <div className="flex items-center bg-vscode-bg p-0.5 rounded border border-vscode-border text-xs">
            <button
              onClick={() => setDataSourceMode('table')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                dataSourceMode === 'table'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
            >
              <span className="codicon codicon-table text-xs"></span>
              <span>Table Aggregate</span>
            </button>
            <button
              onClick={() => {
                setDataSourceMode('query');
                if (!customSql) {
                  setCustomSql(currentQuery);
                }
              }}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                dataSourceMode === 'query'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
            >
              <span className="codicon codicon-terminal text-xs"></span>
              <span>Custom SQL</span>
            </button>
          </div>

          {/* Table Selector (if Table Mode) */}
          {dataSourceMode === 'table' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-vscode-fg/60">Table:</span>
              <select
                value={selectedTableName}
                onChange={(e) => {
                  setSelectedTableName(e.target.value);
                  onSelectTable(e.target.value);
                }}
                className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2.5 py-1 text-xs outline-none focus:border-vscode-focusBorder cursor-pointer font-medium"
              >
                {allTables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.type === 'view' ? '[View] ' : ''}{t.name} ({t.rowCount.toLocaleString()} rows)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Chart Type Buttons */}
          <div className="flex items-center bg-vscode-bg p-0.5 rounded border border-vscode-border text-xs gap-0.5">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'bar'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Vertical Bar Chart"
            >
              <span className="codicon codicon-graph-bar text-xs"></span>
              <span>Bar</span>
            </button>

            <button
              onClick={() => setChartType('horizontalBar')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'horizontalBar'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Horizontal Bar Chart"
            >
              <span className="codicon codicon-list-ordered text-xs"></span>
              <span>Horizontal</span>
            </button>

            <button
              onClick={() => setChartType('line')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'line'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Line Trend Chart"
            >
              <span className="codicon codicon-graph-line text-xs"></span>
              <span>Line</span>
            </button>

            <button
              onClick={() => setChartType('area')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'area'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Area Gradient Chart"
            >
              <span className="codicon codicon-graph text-xs"></span>
              <span>Area</span>
            </button>

            <button
              onClick={() => setChartType('donut')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'donut'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Donut Distribution Chart"
            >
              <span className="codicon codicon-pie-chart text-xs"></span>
              <span>Donut</span>
            </button>

            <button
              onClick={() => setChartType('scatter')}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                chartType === 'scatter'
                  ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                  : 'text-vscode-fg/70 hover:text-vscode-fg'
              }`}
              title="Scatter Correlation Plot"
            >
              <span className="codicon codicon-symbol-misc text-xs"></span>
              <span>Scatter</span>
            </button>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Reset chart settings to default auto-detection"
          >
            <span className="codicon codicon-refresh text-xs"></span>
            <span>Reset Default</span>
          </button>

          <button
            onClick={handleCopySql}
            className="flex items-center gap-1 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Copy underlying SQL aggregation query"
          >
            <span className="codicon codicon-copy text-xs"></span>
            <span>Copy SQL</span>
          </button>

          <div className="h-4 w-px bg-vscode-border mx-1"></div>

          <button
            onClick={handleExportSvg}
            className="flex items-center gap-1 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Export chart as scalable vector graphic (SVG)"
          >
            <span className="codicon codicon-cloud-download text-xs"></span>
            <span>SVG</span>
          </button>

          <button
            onClick={handleExportPng}
            className="flex items-center gap-1 px-2.5 py-1 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded text-xs font-medium transition-colors shadow-sm"
            title="Export high-resolution PNG image"
          >
            <span className="codicon codicon-file-media text-xs"></span>
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Main Body: Left Config Drawer & Right Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Options Configuration Panel */}
        <aside className="w-72 border-r border-vscode-border bg-vscode-sideBar flex flex-col overflow-y-auto flex-shrink-0 text-xs">
          {/* Quick Presets Section */}
          {presets.length > 0 && dataSourceMode === 'table' && (
            <div className="p-3 border-b border-vscode-border">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-vscode-fg/70 uppercase tracking-wide mb-2">
                <span className="codicon codicon-sparkle text-amber-400"></span>
                <span>Insight Presets</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 bg-vscode-bg/60 hover:bg-vscode-list-hoverBg border border-vscode-border/60 rounded text-left transition-colors text-vscode-fg"
                  >
                    <span className="truncate">{p.label}</span>
                    <span className={`codicon ${p.icon} text-vscode-info text-xs ml-2 opacity-80`}></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Configuration Form Controls */}
          {dataSourceMode === 'table' ? (
            <div className="p-3 space-y-3.5">
              {/* Dimension X-Axis */}
              <div>
                <label className="block text-vscode-fg/70 font-medium mb-1">
                  X-Axis / Category Column:
                </label>
                <select
                  value={xAxisCol}
                  onChange={(e) => setXAxisCol(e.target.value)}
                  className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1.5 outline-none focus:border-vscode-focusBorder cursor-pointer"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type || 'TEXT'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Grouping Option (if date column) */}
              {dateCols.some((d) => d.name === xAxisCol) && (
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Date Truncation / Interval:
                  </label>
                  <select
                    value={dateGrouping}
                    onChange={(e) => setDateGrouping(e.target.value as any)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1.5 outline-none focus:border-vscode-focusBorder cursor-pointer"
                  >
                    <option value="none">Exact Timestamp / Value</option>
                    <option value="day">By Day (YYYY-MM-DD)</option>
                    <option value="month">By Month (YYYY-MM)</option>
                    <option value="year">By Year (YYYY)</option>
                  </select>
                </div>
              )}

              {/* Aggregation Function */}
              {chartType !== 'scatter' && (
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Metric Aggregation:
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const).map((agg) => (
                      <button
                        key={agg}
                        onClick={() => setAggregation(agg)}
                        className={`py-1 rounded border text-center font-mono font-medium transition-colors ${
                          aggregation === agg
                            ? 'bg-vscode-button text-vscode-buttonFg border-vscode-button'
                            : 'bg-vscode-bg/50 border-vscode-border hover:bg-vscode-list-hoverBg text-vscode-fg/80'
                        }`}
                      >
                        {agg}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Y-Axis / Metric Column (only needed if agg is not COUNT) */}
              {(aggregation !== 'COUNT' || chartType === 'scatter') && (
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Y-Axis / Value Column:
                  </label>
                  <select
                    value={yAxisCol}
                    onChange={(e) => setYAxisCol(e.target.value)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1.5 outline-none focus:border-vscode-focusBorder cursor-pointer"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.type || 'NUMERIC'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Limit / Top-N */}
              <div>
                <label className="block text-vscode-fg/70 font-medium mb-1">
                  Rows Limit (Top-N):
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {[5, 10, 15, 25].map((n) => (
                    <button
                      key={n}
                      onClick={() => setLimit(n)}
                      className={`py-1 rounded border text-center font-mono font-medium transition-colors ${
                        limit === n
                          ? 'bg-vscode-button text-vscode-buttonFg border-vscode-button'
                          : 'bg-vscode-bg/50 border-vscode-border hover:bg-vscode-list-hoverBg text-vscode-fg/80'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Order */}
              {chartType !== 'scatter' && (
                <div>
                  <label className="block text-vscode-fg/70 font-medium mb-1">
                    Sort Sequence:
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1.5 outline-none focus:border-vscode-focusBorder cursor-pointer"
                  >
                    <option value="desc">Metric High to Low (Descending)</option>
                    <option value="asc">Metric Low to High (Ascending)</option>
                    <option value="alphaAsc">Category A → Z (Chronological)</option>
                    <option value="alphaDesc">Category Z → A</option>
                  </select>
                </div>
              )}

              {/* Color Theme Palette */}
              <div>
                <label className="block text-vscode-fg/70 font-medium mb-1">
                  Color Palette:
                </label>
                <select
                  value={palette}
                  onChange={(e) => setPalette(e.target.value as any)}
                  className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1.5 outline-none focus:border-vscode-focusBorder cursor-pointer"
                >
                  {Object.values(COLOR_PALETTES).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Visual Toggles */}
              <div className="pt-2 border-t border-vscode-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-vscode-fg/80">
                  <input
                    type="checkbox"
                    checked={showDataLabels}
                    onChange={(e) => setShowDataLabels(e.target.checked)}
                    className="rounded text-vscode-button"
                  />
                  <span>Show Data Value Labels</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-vscode-fg/80">
                  <input
                    type="checkbox"
                    checked={showGridLines}
                    onChange={(e) => setShowGridLines(e.target.checked)}
                    className="rounded text-vscode-button"
                  />
                  <span>Show Chart Gridlines</span>
                </label>

                {(chartType === 'line' || chartType === 'area') && (
                  <label className="flex items-center gap-2 cursor-pointer text-vscode-fg/80">
                    <input
                      type="checkbox"
                      checked={smoothCurve}
                      onChange={(e) => setSmoothCurve(e.target.checked)}
                      className="rounded text-vscode-button"
                    />
                    <span>Smooth Spline Curves</span>
                  </label>
                )}
              </div>
            </div>
          ) : (
            /* Custom SQL Editor */
            <div className="p-3 flex-1 flex flex-col gap-2">
              <label className="text-vscode-fg/70 font-medium">
                Enter Custom SQL Query:
              </label>
              <textarea
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                placeholder="SELECT category, COUNT(*) as metric FROM ... GROUP BY category"
                className="flex-1 min-h-[220px] bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded p-2 text-xs font-mono outline-none focus:border-vscode-focusBorder resize-none leading-relaxed"
              />
              <button
                onClick={() => {
                  if (customSql.trim()) {
                    onExecuteQuery(customSql, 'visualizer');
                  }
                }}
                className="w-full py-1.5 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <span className="codicon codicon-play"></span>
                <span>Run & Visualize</span>
              </button>
            </div>
          )}
        </aside>

        {/* Right Side: Interactive Chart Area */}
        <main className="flex-1 flex flex-col bg-vscode-editor-bg overflow-hidden relative">
          {/* Quick Metrics Header Banner */}
          {chartData.length > 0 && (
            <div className="h-10 border-b border-vscode-border bg-vscode-header/50 px-4 flex items-center justify-between text-xs flex-shrink-0">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-vscode-fg/60">Categories / Points: </span>
                  <span className="font-mono font-semibold text-vscode-fg">{stats.count}</span>
                </div>
                <div>
                  <span className="text-vscode-fg/60">Total Aggregate: </span>
                  <span className="font-mono font-semibold text-vscode-info">{formatMetricNumber(stats.total)}</span>
                </div>
                <div>
                  <span className="text-vscode-fg/60">Average: </span>
                  <span className="font-mono font-semibold text-vscode-fg">{formatMetricNumber(stats.avg)}</span>
                </div>
                <div>
                  <span className="text-vscode-fg/60">Peak: </span>
                  <span className="font-mono font-semibold text-emerald-400">{formatMetricNumber(stats.max)}</span>
                </div>
              </div>

              {chartQueryResult?.durationMs !== undefined && (
                <div className="text-vscode-fg/50 font-mono text-[11px]">
                  Executed in {chartQueryResult.durationMs.toFixed(2)}ms
                </div>
              )}
            </div>
          )}

          {/* Error notification if query had issues */}
          {chartQueryResult?.error && (
            <div className="m-4 p-3 bg-red-500/15 border border-red-500/40 rounded-lg text-xs text-red-300 flex items-start gap-2">
              <span className="codicon codicon-error text-red-400 mt-0.5"></span>
              <div>
                <div className="font-semibold">Query execution error</div>
                <div className="font-mono mt-0.5 opacity-90">{chartQueryResult.error}</div>
              </div>
            </div>
          )}

          {/* SVG Canvas */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <ChartRenderer
              chartType={chartType}
              data={chartData}
              paletteName={palette}
              showDataLabels={showDataLabels}
              showGridLines={showGridLines}
              smoothCurve={smoothCurve}
              xAxisLabel={xAxisCol}
              yAxisLabel={aggregation !== 'COUNT' ? `${aggregation}(${yAxisCol})` : 'COUNT(*)'}
              svgRef={svgRef}
            />
          </div>

          {/* SQL Preview Footer */}
          <div className="border-t border-vscode-border bg-vscode-bg/80 px-3 py-1.5 flex items-center justify-between text-[11px] text-vscode-fg/60 font-mono overflow-x-auto flex-shrink-0">
            <div className="flex items-center gap-2 truncate pr-2">
              <span className="codicon codicon-symbol-keyword text-vscode-info"></span>
              <span className="truncate">{currentQuery.replace(/\s+/g, ' ')}</span>
            </div>
            <button
              onClick={handleCopySql}
              className="flex-shrink-0 hover:text-vscode-fg text-[11px] underline"
            >
              Copy
            </button>
          </div>

          {/* Floating Toast Notification */}
          {toastMessage && (
            <div className="absolute bottom-10 right-6 bg-vscode-info text-white text-xs px-3 py-1.5 rounded shadow-lg flex items-center gap-1.5 animate-bounce z-40">
              <span className="codicon codicon-check"></span>
              <span>{toastMessage}</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
