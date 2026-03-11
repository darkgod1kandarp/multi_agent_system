# Next.js Chat Application

This is a simple chat application built with Next.js. It features a clean and modern design inspired by the color scheme of the reference website.

## Features

- Real-time chat functionality
- User-friendly interface
- Light and dark theme toggle
- Responsive design

## Project Structure

```
nextjs-chat-app
├── app
│   ├── api
│   │   └── chat
│   │       └── route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components
│   ├── chat
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   └── ChatWindow.tsx
│   └── ui
│       └── ThemeToggle.tsx
├── lib
│   └── utils.ts
├── public
│   └── fonts
├── styles
│   └── theme.css
├── .env.local
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

To get started with the project, follow these steps:

1. Clone the repository:
   ```
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```
   cd nextjs-chat-app
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Run the development server:
   ```
   npm run dev
   ```

5. Open your browser and go to `http://localhost:3000` to see the application in action.

## Usage

- Type your message in the input field and press the send button to send a message.
- Use the theme toggle to switch between light and dark modes.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or features you'd like to add.

## License

This project is licensed under the MIT License. See the LICENSE file for details.