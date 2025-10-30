import Head from 'next/head'
import { useState, useEffect } from 'react'
import RightPanel from '../components/RightPanel'
import TopBar from '../components/TopBar'
import MainChart from '../components/MainChart'

export default function Home() {
  const [accountTotals, setAccountTotals] = useState([])
  const [initialBalance, setInitialBalance] = useState(10000)

  useEffect(() => {
    const fetchAccountTotals = async () => {
      try {
        const response = await fetch('/api/account-totals')
        const data = await response.json()
        setAccountTotals(data.accountTotals || [])
        if (data.initialBalance) {
          setInitialBalance(data.initialBalance)
        }
      } catch (error) {
        console.error('Failed to fetch account totals:', error)
      }
    }

    fetchAccountTotals()
    const interval = setInterval(fetchAccountTotals, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <Head>
        <title>AI trading in real markets</title>
        <meta name="description" content="Alpha Arena - AI models trading in real markets" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logos/favicon.png" />
      </Head>

      <div className="h-screen overflow-hidden flex flex-col bg-white text-black">
        <nav className="sticky top-0 z-50 border-b-2 border-border bg-surface">
          <div className="mx-auto max-w-[95vw] px-2">
            <div className="flex h-14 md:h-14 h-10 items-center justify-between">
              <div className="flex items-center">
                <a href="/">
                  <img src="/logos/alpha logo.png" alt="Alpha Arena" className="alpha-logo md:h-12 h-8 w-auto md:ml-0 -ml-2 cursor-pointer" />
                </a>
              </div>
              
              <div className="hidden items-center space-x-6 md:flex md:absolute md:left-1/2 md:-translate-x-1/2">
                <a className="terminal-header text-foreground hover:text-accent-primary" href="/">LIVE</a>
                <span className="text-foreground">|</span>
                <a className="terminal-header text-foreground hover:text-accent-primary" href="/leaderboard">LEADERBOARD</a>
                <span className="text-foreground">|</span>
                <a className="terminal-header text-foreground hover:text-accent-primary" href="/blog">BLOG</a>
                <span className="text-foreground">|</span>
                <div className="group relative">
                  <button className="terminal-header text-foreground hover:text-accent-primary">MODELS</button>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row items-end md:items-center space-y-0.5 md:space-y-0 md:space-x-4">
                <a className="terminal-text text-[8px] md:text-xs text-foreground hover:text-accent-primary underline flex items-center gap-1" href="/waitlist">
                  JOIN THE PLATFORM WAITLIST
                </a>
                <a href="https://thenof1.com/" target="_blank" rel="noopener noreferrer" className="terminal-text text-[8px] md:text-xs text-foreground hover:text-accent-primary underline flex items-center gap-1 pb-0">
                  ABOUT NOF1
                </a>
              </div>
            </div>
          </div>
        </nav>

        <div className="border-b-2 border-gray-300 bg-white md:hidden">
          <div className="flex items-center justify-around px-2 py-2">
            <a className="terminal-header text-xs text-black hover:text-blue-600 font-bold" href="/">LIVE</a>
            <a className="terminal-header text-xs text-black hover:text-blue-600" href="/leaderboard">LEADERBOARD</a>
            <a className="terminal-header text-xs text-black hover:text-blue-600" href="/blog">BLOG</a>
          </div>
        </div>

        <TopBar accountTotals={accountTotals} initialBalance={initialBalance} />

        <main className="min-h-0 flex-1">
          <div className="flex h-full flex-col bg-background">
            <div className="flex h-full min-h-0">
              <MainChart />
              <RightPanel />
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
