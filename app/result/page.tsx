import type { Metadata } from 'next';
import Link from 'next/link';
import { formatEnglishCount, formatSpentTokens, parseVictoryShareParams } from '@/lib/game/session';

type ResultPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const toSearchParams = (values: Record<string, string | string[] | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  return params;
};

export const generateMetadata = async ({ searchParams }: ResultPageProps): Promise<Metadata> => {
  const params = toSearchParams(await searchParams);
  const result = parseVictoryShareParams(params);
  const imageUrl = new URL('/api/share-card', SITE_ORIGIN);
  imageUrl.search = params.toString();
  const title = `Project “${result.projectName}” is deployed`;
  const description = `The deploy outlived ${formatEnglishCount(result.programmerNames.length, 'vibe coder')} and ${formatEnglishCount(result.failedDeployments, 'failed attempt')}.`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'VvibeCoder Sim',
      images: [{ url: imageUrl.toString(), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl.toString()],
    },
  };
};

export default async function ResultPage({ searchParams }: ResultPageProps) {
  const result = parseVictoryShareParams(toSearchParams(await searchParams));

  return (
    <main className="min-h-screen bg-[#f4fbf8] px-4 py-10 text-emerald-950 sm:px-8">
      <section className="mx-auto max-w-5xl rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">VvibeCoder Sim · production</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Congratulations! The deploy outlived everyone</h1>
        <p className="mt-4 max-w-4xl text-lg leading-8 text-emerald-800 sm:text-2xl sm:leading-10">
          Project “{result.projectName}” made it to production. The final vibe coder pressed the button, and the infrastructure chose not to object.
        </p>

        <div className="mt-8">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">Coders who worked on it · {result.programmerNames.length}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.programmerNames.map((name, index) => (
              <span key={`${name}-${index}`} className="rounded-lg border border-emerald-200 bg-white/90 px-3 py-2 font-medium">
                {index + 1}. {name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total tokens', formatSpentTokens(result.totalTokensSpent)],
            ['Final coder', formatSpentTokens(result.currentProgrammerTokensSpent || 0)],
            ['Context', formatSpentTokens(result.contextTokens || 0)],
            ['Failures', String(result.failedDeployments)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-emerald-100 bg-white/85 p-4">
              <p className="text-xs font-medium text-emerald-700">{label}</p>
              <p className="mt-1 font-mono text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800">
          Try to survive your own deploy
        </Link>
      </section>
    </main>
  );
}
