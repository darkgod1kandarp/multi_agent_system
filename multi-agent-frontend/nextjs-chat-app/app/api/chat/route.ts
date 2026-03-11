import { NextResponse } from 'next/server';

interface ChatMessage {
    sender: string;
    message: string;
    timestamp: string;
}

let chatMessages: ChatMessage[] = [];

export async function GET() {
    return NextResponse.json(chatMessages);
}

export async function POST(request: Request) {
    const { sender, message } = await request.json();
    const newMessage: ChatMessage = { sender, message, timestamp: new Date().toISOString() };
    chatMessages.push(newMessage);
    return NextResponse.json(newMessage, { status: 201 });
}