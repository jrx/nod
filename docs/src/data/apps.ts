import type {
  AppManifest,
  AppDefinitionInput,
  AppContract,
} from '../../../src/shared/app-definitions';

const manifests = import.meta.glob<AppManifest>('../../../src/apps/*/plugin.json', {
  eager: true,
  import: 'default',
});
const definitions = import.meta.glob<AppDefinitionInput>(
  '../../../src/apps/*/io.n8n.nod/app.json',
  {
    eager: true,
    import: 'default',
  },
);
const contracts = import.meta.glob<AppContract>('../../../src/apps/*/io.n8n.nod/contract.json', {
  eager: true,
  import: 'default',
});
const icons = import.meta.glob<string>('../../../src/apps/*/io.n8n.nod/**/*.{svg,png,webp}', {
  eager: true,
  query: '?url&inline',
  import: 'default',
});

export const apps = Object.entries(manifests)
  .map(([path, manifest]) => {
    const directory = path.slice(0, -'plugin.json'.length);
    const details = definitions[`${directory}io.n8n.nod/app.json`];
    const contract = contracts[`${directory}io.n8n.nod/contract.json`];
    return {
      slug: manifest.name,
      name: details.displayName,
      description: manifest.description,
      version: manifest.version,
      author: manifest.author.name,
      categories: details.categories ?? [],
      prompts: details.prompts,
      requirements: details.requirements,
      limitations: details.limitations,
      authentication: details.connection.authentication,
      instance: details.connection.type === 'mcp' && 'endpoint' in details.connection,
      source: contract.source,
      icon: details.icon ? icons[directory + details.icon.replace(/^\.\//, '')] : undefined,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
