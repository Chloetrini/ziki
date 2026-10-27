import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { auth } from '@/auth';
import Homepage from '@/components/homepage/homepage';
import '@/components/homepage/homepage.css';

// Self-hosted (#1431): no Google Fonts request at build time.
const dmSans = localFont({ src: './fonts/dm-sans-latin.woff2', weight: '400 700', variable: '--font-dm-sans' });
const manrope = localFont({ src: './fonts/manrope-latin.woff2', weight: '500 800', variable: '--font-manrope' });

export const metadata: Metadata = {
  title: 'Ziki Issues',
  description: 'Move every issue forward with your agents. Permissioned, attributable collaboration with people in control.',
};

export default async function Page() {
  const session = await auth();
  return <div className={dmSans.variable + ' ' + manrope.variable}><Homepage signedIn={Boolean(session?.user)} /></div>;
}
