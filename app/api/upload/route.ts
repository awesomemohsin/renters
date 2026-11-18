import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    // Only allow image files as requested
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files (JPEG, PNG, WEBP, etc.) are permitted.' }, { status: 400 })
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image size exceeds the 10MB limit.' }, { status: 400 })
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pathname = `renters/${Date.now()}-${cleanFileName}`

    // Upload to Vercel Blob if BLOB_READ_WRITE_TOKEN is configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(pathname, file, {
        access: 'public',
        addRandomSuffix: true,
      })
      return NextResponse.json({
        url: blob.url,
        pathname: blob.pathname,
        name: file.name,
      })
    } else {
      // Graceful development fallback when running locally without a Vercel Blob store token
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`
      return NextResponse.json({
        url: dataUrl,
        pathname,
        name: file.name,
        localFallback: true,
      })
    }
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json({ error: 'Unable to upload image to Vercel Blob.' }, { status: 500 })
  }
}
