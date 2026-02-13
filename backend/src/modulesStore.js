import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modulesSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'modules.json');

const ensureDataFile = async (dataFile) => {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '[]\n', 'utf-8');
  }
};

export const readModules = async (dataFile = DEFAULT_DATA_FILE) => {
  await ensureDataFile(dataFile);
  const raw = await fs.readFile(dataFile, 'utf-8');
  const parsedJson = JSON.parse(raw);
  return modulesSchema.parse(parsedJson);
};

export const writeModules = async (modules, dataFile = DEFAULT_DATA_FILE) => {
  const normalizedModules = modulesSchema.parse(modules);
  await ensureDataFile(dataFile);
  await fs.writeFile(dataFile, `${JSON.stringify(normalizedModules, null, 2)}\n`, 'utf-8');
};
