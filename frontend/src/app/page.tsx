import Link from "next/link";

export default function Home() {
  return (
    <main className="clean-page">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
              API request inspection
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl">
              Inspect every proxied request and response in one clean workspace.
            </h1>
            <p className="muted-copy mt-6 max-w-2xl text-lg leading-8">
              API-Inspector sits between your client and the target API,
              forwards traffic, stores the exchange, and gives you a fast
              dashboard for headers, payloads, status codes, latency, and live
              traffic.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link className="primary-button" href="/dashboard">
                Launch workspace
              </Link>
              <Link className="secondary-button" href="/projects">
                Configure project
              </Link>
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="badge">What you get</div>
            <ul className="muted-copy mt-6 space-y-4 text-sm">
              <li className="feature-row">
                <span className="feature-dot" />
                Full request details including method, URL, headers, query
                params, and body preview
              </li>
              <li className="feature-row">
                <span className="feature-dot" />
                Response headers, payload preview, status code, latency, and
                upstream failures
              </li>
              <li className="feature-row">
                <span className="feature-dot" />
                Live SSE traffic feed and searchable SQLite-backed history
              </li>
              <li className="feature-row">
                <span className="feature-dot" />
                Multi-project routing using readable proxy slugs
              </li>
            </ul>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            title="Simple setup"
            description="Create a project, point it at the target base URL, and start sending requests through a readable proxy path."
          />
          <FeatureCard
            title="Built for debugging"
            description="Inspect request and response structure quickly without hunting through browser devtools or backend logs."
          />
          <FeatureCard
            title="One deployable service"
            description="The Go app serves the proxy, APIs, SQLite history, SSE events, and the statically built frontend."
          />
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="glass-panel p-5">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="muted-copy mt-3 text-sm leading-7">{description}</p>
    </div>
  );
}
