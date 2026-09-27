import { BadRequestException } from '@nestjs/common';

// Inspect cells, not physical lines. Reject rather than rewriting user bytes.
// Comma, semicolon and tab dialects are inspected to cover spreadsheet imports.
export function validateCsv(text: string) {
  for (const delimiter of [',', ';', '\t']) {
    let cell = '';
    let quoted = false;
    const check = () => {
      if (
        /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(cell) ||
        /^[ \uFEFF]*[\t\r\n]/u.test(cell)
      )
        throw new BadRequestException(
          'CSV contains an unsafe spreadsheet formula cell',
        );
      cell = '';
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (quoted || !cell.trim()) quoted = !quoted;
        else cell += char;
      } else if (
        !quoted &&
        (char === delimiter || char === '\r' || char === '\n')
      ) {
        check();
        if (char === '\r' && text[i + 1] === '\n') i++;
      } else cell += char;
    }
    check();
    if (quoted)
      throw new BadRequestException('CSV contains an unterminated quoted cell');
  }
}
