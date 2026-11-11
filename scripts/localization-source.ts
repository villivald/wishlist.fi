import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "generated" ||
        full === path.join("src", "i18n", "messages")
        ? []
        : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && entry.name !== "client-keys.ts"
      ? [path.resolve(full)]
      : [];
  });

export const runtimeStrings = (source: ts.Node) => {
  const values = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isTypeNode(node)) return;
    if (ts.isStringLiteralLike(node)) values.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
};

// Feedback crosses the server boundary as text, including API image replies and
// application errors. Keep those catalog entries even without a browser import.
export const runtimeFeedbackStrings = (source: ts.SourceFile) => {
  const values = new Set<string>();
  const visit = (node: ts.Node) => {
    const argument =
      ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        ? node.expression.text === "toActionState"
          ? node.arguments[1]
          : node.expression.text === "reply"
            ? node.arguments[0]
            : undefined
        : ts.isNewExpression(node) &&
            ts.isIdentifier(node.expression) &&
            /Error$/.test(node.expression.text)
          ? node.arguments?.[0]
          : undefined;
    if (argument)
      runtimeStrings(argument).forEach((value) => values.add(value));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
};

export const localizationReferences = (catalogKeys: readonly string[]) => {
  const sources = new Map(
    sourceFiles("src").map((filename) => [
      filename,
      ts.createSourceFile(
        filename,
        readFileSync(filename, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      ),
    ]),
  );
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    process.cwd(),
  );
  const visited = new Set<string>();
  const browserModules = new Set<string>();
  const clientStrings = new Set<string>();
  const visitClientModule = (filename: string, browser = false) => {
    const modules = browser ? browserModules : visited;
    if (modules.has(filename)) return;
    modules.add(filename);
    const source = sources.get(filename);
    if (
      !source ||
      source.statements.some(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === "use server",
      )
    )
      return;
    runtimeStrings(source).forEach((value) => clientStrings.add(value));
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.isTypeOnly
      )
        continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const resolved = ts.resolveModuleName(
        specifier.text,
        filename,
        options,
        ts.sys,
      ).resolvedModule;
      if (resolved) visitClientModule(resolved.resolvedFileName, browser);
    }
  };
  for (const [filename, source] of sources) {
    const client = source.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === "use client",
    );
    if (client) visitClientModule(filename, true);
    // Shared server components also use the hook dictionary, but their server
    // dependencies do not represent browser imports.
    if (
      source.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          /(?:^|\/)use-text$/.test(statement.moduleSpecifier.text),
      )
    )
      visitClientModule(filename);
  }
  for (const source of sources.values()) {
    runtimeFeedbackStrings(source).forEach((value) => clientStrings.add(value));
  }
  const allStrings = new Set(
    [...sources.values()].flatMap((source) => [...runtimeStrings(source)]),
  );
  return {
    clientKeys: catalogKeys.filter((key) => clientStrings.has(key)).sort(),
    unreferencedKeys: catalogKeys.filter((key) => !allStrings.has(key)).sort(),
    clientCatalogLeaks: [
      "src/i18n/text.ts",
      "src/i18n/messages/en.json",
      "src/i18n/messages/fi.json",
    ].filter((filename) => browserModules.has(path.resolve(filename))),
  };
};
