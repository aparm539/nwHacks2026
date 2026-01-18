import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center">
      <main className="flex flex-col items-center gap-12">
        <h1 className="text-5xl font-bold text-white tracking-tight">
          hacker<span className="text-emerald-400">Draft</span>
        </h1>

        <div className="flex gap-4">
          <Link
            href="/sync"
            className="px-6 py-3 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Sync
          </Link>
          <Link
            href="/keywords"
            className="px-6 py-3 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Keywords
          </Link>
          <Link
            href="/draft"
            className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
          >
            Draft
          </Link>
        </div>
      </main>
    </div>
  );
}
