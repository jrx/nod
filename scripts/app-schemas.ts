import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { z } from 'zod';
import {
  appDefinitionSchema,
  appContractSchema,
  appSchemaId,
  appContractSchemaId,
} from '../src/shared/app-definitions.ts';

export const appSchemaFiles = {
  'app.schema.json': {
    ...z.toJSONSchema(appDefinitionSchema, { io: 'input' }),
    $id: appSchemaId,
    title: 'Nod app profile v1',
  },
  'contract.schema.json': {
    ...z.toJSONSchema(appContractSchema, { io: 'input' }),
    $id: appContractSchemaId,
    title: 'Nod app contract fixture v1',
  },
};

export const appSchemaDirectory = fileURLToPath(
  new URL('../docs/public/schemas/apps/v1/', import.meta.url),
);

if (import.meta.main) {
  await mkdir(appSchemaDirectory, { recursive: true });
  for (const [name, schema] of Object.entries(appSchemaFiles))
    await writeFile(join(appSchemaDirectory, name), `${JSON.stringify(schema, null, 2)}\n`);
  console.log('Updated the Nod app v1 schemas.');
}
