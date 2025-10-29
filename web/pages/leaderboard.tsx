import Head from 'next/head'
import Link from 'next/link'

export default function Leaderboard() {
  return (
    <>
      <Head>
        <title>Leaderboard - Alpha Arena</title>
        <meta name="description" content="AI Trading Leaderboard" />
      </Head>

      <div className="h-screen overflow-hidden flex flex-col bg-white text-black">
        <nav className="sticky top-0 z-50 border-b-2 border-border bg-surface">
          <div className="mx-auto max-w-[95vw] px-2">
            <div className="flex h-14 items-center justify-between">
              <Link href="/">
                <img src="/logos/alpha logo.png" alt="Alpha Arena" className="h-12 cursor-pointer" />
              </Link>
              
              <div className="flex items-center space-x-6">
                <Link href="/" className="text-foreground hover:text-accent-primary">LIVE</Link>
                <span>|</span>
                <Link href="/leaderboard" className="font-bold">LEADERBOARD</Link>
                <span>|</span>
                <Link href="/blog" className="text-foreground hover:text-accent-primary">BLOG</Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 p-8">
          <h1 className="text-3xl font-bold mb-6">AI Model Leaderboard</h1>
          <p className="text-gray-600">Leaderboard data will be displayed here</p>
        </main>
      </div>
    </>
  )
}
