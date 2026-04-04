import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DATA_DIR = path.resolve(process.cwd(), '../../data/workflows');

export async function POST(request: Request) {
  const { workflowId } = await request.json();
  if (!workflowId || typeof workflowId !== 'string') {
    return NextResponse.json({ error: 'Missing workflowId' }, { status: 400 });
  }

  // Try output folder first, fall back to workflow folder
  const outputPath = path.join(DATA_DIR, workflowId, 'output');
  const workflowPath = path.join(DATA_DIR, workflowId);
  const folderPath = fs.existsSync(outputPath) ? outputPath : workflowPath;

  if (!fs.existsSync(folderPath)) {
    return NextResponse.json({ error: 'Folder not found', resolved: folderPath }, { status: 404 });
  }

  exec(`open "${folderPath}"`);

  return NextResponse.json({ ok: true });
}
