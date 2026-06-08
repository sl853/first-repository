const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'brain', 'reports');

function readText(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, 'utf8');
}

function summarizeReportContent(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const heading = lines.find((line) => line.startsWith('#'))?.replace(/^#+\s*/, '') || 'Scout report';
  const synthesisIndex = lines.findIndex((line) => /^Scout synthesis:?$/i.test(line));
  const summaryLines = [];

  if (synthesisIndex >= 0) {
    for (const line of lines.slice(synthesisIndex + 1)) {
      if (line.startsWith('- ')) summaryLines.push(line.replace(/^- /, ''));
      if (summaryLines.length === 3) break;
    }
  }

  if (!summaryLines.length) {
    for (const line of lines) {
      if (!line.startsWith('#') && !/:$/.test(line) && !/^\d+\./.test(line)) {
        summaryLines.push(line.replace(/^- /, ''));
      }
      if (summaryLines.length === 3) break;
    }
  }

  return {
    heading,
    summaryLines,
  };
}

function listReports(limit = 8) {
  if (!fs.existsSync(REPORTS_DIR)) return [];

  return fs
    .readdirSync(REPORTS_DIR)
    .filter((file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md')
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const fullPath = path.join(REPORTS_DIR, file);
      const content = readText(fullPath);
      const stats = fs.statSync(fullPath);

      return {
        file,
        content,
        updatedAt: stats.mtime.toISOString(),
        ...summarizeReportContent(content),
      };
    });
}

function getLatestReport() {
  return listReports(1)[0] || null;
}

function getLatestReportStatus() {
  const report = getLatestReport();
  if (!report) {
    return {
      exists: false,
      file: null,
      updatedAt: null,
      heading: null,
    };
  }

  return {
    exists: true,
    file: report.file,
    updatedAt: report.updatedAt,
    heading: report.heading,
  };
}

module.exports = {
  listReports,
  getLatestReport,
  getLatestReportStatus,
  summarizeReportContent,
};
