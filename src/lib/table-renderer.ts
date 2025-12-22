import pc from "picocolors";

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

/**
 * Table column definition.
 */
interface TableColumn {
  /** Column header */
  header: string;
  /** Key to access data */
  key: string;
  /** Fixed width (optional) - if not set, will be calculated */
  width?: number;
  /** Minimum width (optional) */
  minWidth?: number;
  /** Text alignment */
  align?: "left" | "right";
  /** Header color */
  headerColor?: "green" | "yellow" | "cyan" | "blue" | "magenta" | "dim";
  /** Whether this column can grow to fill space */
  grow?: boolean;
}

/**
 * Get the current terminal width.
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Render a table to the console.
 *
 * @param columns Column definitions
 * @param data Data rows (array of objects with keys matching column keys)
 */
export function renderTable(
  columns: TableColumn[],
  data: Record<string, string | number>[],
  _options?: { fillWidth?: boolean }
): void {
  if (data.length === 0) {
    console.log(pc.dim("No results found."));
    return;
  }

  const terminalWidth = getTerminalWidth();
  const gutter = 2; // Space between columns
  const totalGutterWidth = gutter * (columns.length - 1);

  // Calculate base column widths
  const baseWidths = columns.map((col) => {
    if (col.width) return col.width;
    const headerLen = col.header.length;
    const maxDataLen = data.reduce((max, row) => {
      const value = String(row[col.key] ?? "");
      // Strip ANSI codes for length calculation
      const cleanValue = stripAnsi(value);
      return Math.max(max, cleanValue.length);
    }, 0);
    const minWidth = col.minWidth || headerLen;
    return Math.max(minWidth, Math.min(Math.max(headerLen, maxDataLen), 40));
  });

  // Calculate total width and distribute extra space
  const totalBaseWidth =
    baseWidths.reduce((a, b) => a + b, 0) + totalGutterWidth;
  const extraSpace = Math.max(0, terminalWidth - totalBaseWidth - 2);

  // Find columns that can grow
  const growableColumns = columns
    .map((col, i) => ({ col, index: i }))
    .filter(({ col }) => col.grow !== false);

  // Distribute extra space to growable columns
  const widths = [...baseWidths];
  if (growableColumns.length > 0 && extraSpace > 0) {
    const extraPerColumn = Math.floor(extraSpace / growableColumns.length);
    for (const { index } of growableColumns) {
      widths[index] = (widths[index] ?? 0) + extraPerColumn;
    }
  }

  // Apply header colors
  const applyHeaderColor = (text: string, color?: string): string => {
    switch (color) {
      case "green":
        return pc.green(text);
      case "yellow":
        return pc.yellow(text);
      case "cyan":
        return pc.cyan(text);
      case "blue":
        return pc.blue(text);
      case "magenta":
        return pc.magenta(text);
      case "dim":
        return pc.dim(text);
      default:
        return text;
    }
  };

  // Render header
  const headerRow = columns
    .map((col, i) => {
      const w = widths[i] ?? 10;
      const paddedHeader = padString(col.header, w, col.align);
      return applyHeaderColor(paddedHeader, col.headerColor);
    })
    .join("  ");
  console.log(pc.bold(headerRow));

  // Render separator (use total width for full-width line)
  const totalWidth = widths.reduce((a, b) => a + b, 0) + totalGutterWidth;
  const separator = "─".repeat(totalWidth);
  console.log(pc.dim(separator));

  // Render data rows
  for (const row of data) {
    const dataRow = columns
      .map((col, i) => {
        const value = String(row[col.key] ?? "");
        const width = widths[i] ?? 10;
        // Strip ANSI for truncation calculation, but keep original for display
        const cleanValue = stripAnsi(value);
        if (cleanValue.length > width) {
          // Truncate the clean version, but we need to handle colored values
          const truncated = truncateString(cleanValue, width);
          return padString(truncated, width, col.align);
        }
        // Calculate padding needed
        const paddingNeeded = width - cleanValue.length;
        if (col.align === "right") {
          return " ".repeat(paddingNeeded) + value;
        }
        return value + " ".repeat(paddingNeeded);
      })
      .join("  ");
    console.log(dataRow);
  }
}

/**
 * Pad a string to a fixed width.
 */
function padString(
  str: string,
  width: number,
  align: "left" | "right" = "left"
): string {
  // Strip ANSI codes for length calculation
  const cleanStr = stripAnsi(str);
  if (cleanStr.length >= width) return str;
  const padding = " ".repeat(width - cleanStr.length);
  return align === "right" ? padding + str : str + padding;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Format a number with thousands separators.
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format tested versions for display.
 * Shows first and last version if list is long.
 */
export function formatVersions(versions: string[]): string {
  if (versions.length === 0) return "-";
  const firstVersion = versions[0];
  if (!firstVersion) return "-";
  if (versions.length === 1) return firstVersion;
  const secondVersion = versions[1];
  if (versions.length === 2 && secondVersion)
    return `${firstVersion}, ${secondVersion}`;

  // Sort versions
  const sorted = [...versions].sort(compareVersions);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return versions[0] ?? "-";
  return `${first}-${last}`;
}

/**
 * Compare two Minecraft version strings.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const partsB = b.split(".").map((p) => Number.parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}
