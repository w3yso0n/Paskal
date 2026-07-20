import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/auth-context'
import { AuthGuard } from '@/components/auth/auth-guard'
import { TRANSLATE_DOM_GUARD_SNIPPET } from '@/lib/translate-dom-guard'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Paskal - Sistema de Monitoreo Industrial',
  description: 'Plataforma de monitoreo industrial y gestión de producción',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <head>
        {/* Antes de hidratar: tolera los nodos que mueve el traductor del navegador
            (si no, "Traducir a inglés" tumba la página). Ver lib/translate-dom-guard.ts */}
        <script dangerouslySetInnerHTML={{ __html: TRANSLATE_DOM_GUARD_SNIPPET }} />
      </head>
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </AuthProvider>
        <Toaster richColors position="top-center" closeButton duration={5000} />
        <Analytics />
      </body>
    </html>
  )
}
