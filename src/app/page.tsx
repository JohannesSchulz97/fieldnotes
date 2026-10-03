import { Extractor } from "@/components/extractor";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Extract vocabulary</h1>
      <Extractor />
    </main>
  );
}
