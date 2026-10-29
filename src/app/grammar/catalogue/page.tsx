import { connection } from "next/server";
import { CatalogueOverview } from "@/components/catalogue-overview";
import { GrammarViews } from "@/components/grammar-views";
import { getActiveLanguage } from "@/lib/active-language";
import { listTrackedConstructs } from "@/lib/db/grammar";
import { activeConstructs, getCatalog } from "@/lib/grammar-catalog";
import { languageName } from "@/lib/languages";

export default async function CataloguePage() {
  await connection();
  const language = await getActiveLanguage();
  const catalog = getCatalog(language);
  const tracked = catalog ? await listTrackedConstructs(language) : {};

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Grammar</h1>
        <GrammarViews active="/grammar/catalogue" />
      </div>
      {catalog ? (
        <CatalogueOverview constructs={activeConstructs(catalog)} tracked={tracked} />
      ) : (
        <p className="text-sm text-muted-foreground">
          There is no grammar catalogue for {languageName(language)} yet, so grammar is named freely.
        </p>
      )}
    </main>
  );
}
