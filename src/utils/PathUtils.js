
const SEPARATOR = "/";

function normalizeSeparators(value) {
  return String(value).replace(/\\/g, SEPARATOR);
}

function isAbsolutePath(value) {
  return (
    value.startsWith("/") ||
    /^[a-zA-Z]:\//.test(value)
  );
}

function getRoot(value) {
  if (/^[a-zA-Z]:\//.test(value)) {
    return value.slice(0, 3);
  }

  return value.startsWith("/") ? SEPARATOR : "";
}

function normalizePath(path, { trailingSlash = false } = {}) {
  if (typeof path !== "string") {
    throw new TypeError("Path must be a string.");
  }

  const normalized = normalizeSeparators(path.trim());

  if (!normalized) {
    return "";
  }

  const root = getRoot(normalized);
  const segments = normalized
    .split("/")
    .filter(Boolean);

  const resolved = [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (
        resolved.length > 0 &&
        resolved[ resolved.length - 1 ] !== ".."
      ) {
        resolved.pop();
      } else if (!root) {
        resolved.push("..");
      }

      continue;
    }

    resolved.push(segment);
  }

  let result = root + resolved.join(SEPARATOR);

  if (!result && root) {
    result = root;
  }

  if (trailingSlash && result && !result.endsWith(SEPARATOR)) {
    result += SEPARATOR;
  }

  if (!trailingSlash && result.length > 1) {
    result = result.replace(/\/+$/, "");
  }

  return result;
}

function joinPaths(...parts) {
  const filtered = parts
    .filter(
      part =>
        part !== null &&
        part !== undefined &&
        String(part).trim() !== ""
    )
    .map(part => normalizeSeparators(String(part).trim()));

  if (filtered.length === 0) {
    return "";
  }

  const joined = filtered
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/\/+$/, "");
      }

      return part.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean)
    .join(SEPARATOR);

  return normalizePath(joined);
}

function resolvePath(path, basePath = "") {
  if (typeof path !== "string") {
    throw new TypeError("Path must be a string.");
  }

  const normalizedPath = normalizeSeparators(path.trim());

  if (isAbsolutePath(normalizedPath)) {
    return normalizePath(normalizedPath);
  }

  if (!basePath) {
    return normalizePath(normalizedPath);
  }

  return normalizePath(
    joinPaths(basePath, normalizedPath)
  );
}

function dirname(path) {
  const normalized = normalizePath(path);

  if (!normalized) {
    return "";
  }

  const root = getRoot(normalized);
  const index = normalized.lastIndexOf(SEPARATOR);

  if (index === -1) {
    return "";
  }

  if (index === 0) {
    return SEPARATOR;
  }

  if (index === 2 && /^[a-zA-Z]:\//.test(normalized)) {
    return root;
  }

  return normalized.slice(0, index);
}

function basename(path, extension = "") {
  const normalized = normalizePath(path);

  if (!normalized) {
    return "";
  }

  const name = normalized.slice(
    normalized.lastIndexOf(SEPARATOR) + 1
  );

  if (
    extension &&
    name.endsWith(extension) &&
    name.length > extension.length
  ) {
    return name.slice(0, -extension.length);
  }

  return name;
}

function extname(path) {
  const name = basename(path);
  const index = name.lastIndexOf(".");

  if (index <= 0) {
    return "";
  }

  return name.slice(index);
}

function relativePath(fromPath, toPath) {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);

  if (!from || !to) {
    return to;
  }

  const fromRoot = getRoot(from).toLowerCase();
  const toRoot = getRoot(to).toLowerCase();

  if (fromRoot !== toRoot) {
    return to;
  }

  const fromSegments = from
    .slice(getRoot(from).length)
    .split("/")
    .filter(Boolean);

  const toSegments = to
    .slice(getRoot(to).length)
    .split("/")
    .filter(Boolean);

  let commonIndex = 0;

  while (
    commonIndex < fromSegments.length &&
    commonIndex < toSegments.length &&
    fromSegments[ commonIndex ].toLowerCase() ===
    toSegments[ commonIndex ].toLowerCase()
  ) {
    commonIndex += 1;
  }

  const upward = Array(
    fromSegments.length - commonIndex
  ).fill("..");

  const downward = toSegments.slice(commonIndex);

  return [ ...upward, ...downward ].join(SEPARATOR) || ".";
}

function isWithinDirectory(filePath, directoryPath) {
  const file = normalizePath(filePath);
  const directory = normalizePath(directoryPath);

  if (!file || !directory) {
    return false;
  }

  const normalizedFile = file.toLowerCase();
  const normalizedDirectory = directory.toLowerCase();

  if (normalizedFile === normalizedDirectory) {
    return true;
  }

  const prefix = normalizedDirectory.endsWith(SEPARATOR)
    ? normalizedDirectory
    : normalizedDirectory + SEPARATOR;

  return normalizedFile.startsWith(prefix);
}

function changeExtension(path, extension) {
  if (typeof extension !== "string") {
    throw new TypeError("Extension must be a string.");
  }

  const normalized = normalizePath(path);
  const currentExtension = extname(normalized);
  const base = currentExtension
    ? normalized.slice(0, -currentExtension.length)
    : normalized;

  const nextExtension = extension
    ? extension.startsWith(".")
      ? extension
      : `.${extension}`
    : "";

  return base + nextExtension;
}

const PathUtils = {
  normalizePath,
  joinPaths,
  resolvePath,
  dirname,
  basename,
  extname,
  relativePath,
  isAbsolutePath,
  isWithinDirectory,
  changeExtension
};

export {
  normalizePath,
  joinPaths,
  resolvePath,
  dirname,
  basename,
  extname,
  relativePath,
  isAbsolutePath,
  isWithinDirectory,
  changeExtension
};

export default PathUtils;
