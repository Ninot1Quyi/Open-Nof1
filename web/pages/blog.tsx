import Head from 'next/head'
import Link from 'next/link'

export default function Blog() {
  return (
    <>
      <Head>
        <title>Blog - Alpha Arena</title>
        <meta name="description" content="Alpha Arena Blog" />
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
                <Link href="/leaderboard" className="text-foreground hover:text-accent-primary">LEADERBOARD</Link>
                <span>|</span>
                <Link href="/blog" className="font-bold">BLOG</Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 p-8">
          <h1 className="text-3xl font-bold mb-6">Blog</h1>
          <p className="text-gray-600">Blog posts will be displayed here</p>
        </main>
      </div>
    </>
  )
}
