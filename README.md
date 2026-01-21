# Event Planner

A comprehensive web application for managing events, attendees, and schedules. Built with Next.js, Prisma, and Tailwind CSS.

## 📖 User Manual

For a detailed guide on how to use the application features, please refer to the **[User Manual](USER_MANUAL.md)**.

## Features

- **Meeting Tracker**: Real-time overview of event statistics with optional PDF Briefing Book export.
- **Reports**: Comprehensive analytics with filtering, sorting, and export capabilities (PDF/CSV). Tracks **Pipeline**, **Confirmed**, **Occurred**, and **Canceled** meetings.
- **Briefing Books**: Generate detailed PDF reports for Rooms and Attendees.
- **Authentication**: Secure user authentication and management provided by [Clerk](https://clerk.com/).
- **Monitoring**: Application performance monitoring and error tracking with [Sentry](https://sentry.io/).
- **Role-Based Access Control**: Secure access management with distinct roles (**Root**, **Marketing**, **Admin**, **User**).
- **Security**: Event Password Protection for sharing sensitive events.
- **AI Chat Assistant**: Smart chatbot for event queries and navigation. Features **Persistent Chat** history, **Clear Chat** functionality, and **Enhanced Search** for attendees.
- **Briefing Books**: Generate detailed PDF reports for Rooms and Attendees.
- **Meeting Tags**: Categorize meetings with custom tags (e.g., "Internal", "Client").
- **Attendee Management**: Add, edit, and track event attendees.
- **AI-Powered Auto Complete**: Use Google Gemini to automatically populate attendee professional details.
- **Schedule Management**: Drag-and-drop interface for organizing meetings and sessions.
- **Data Management**: Import, Export, and Factory Reset with **Auto-Backup**.
- **Event Controls**: Read-only mode for **Occurred** events preventing accidental changes.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Clerk Account (for authentication)
- Sentry Account (optional, for monitoring)
- Google Gemini API Key (optional, for Auto Complete feature)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd event-planner
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file in the root directory and add your database connection string:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/event_planner?schema=public"
    
    # Clerk Authentication
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
    
    # Sentry (Optional)
    SENTRY_AUTH_TOKEN=...
    ```

4.  **Initialize Database**:
    Run the Prisma migrations to set up your database schema:
    ```bash
    npx prisma migrate dev
    ```

5.  **Run Development Server**:
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development

### Database Management

- **View Database**: Run `npx prisma studio` to open a web interface for your database.
- **Update Schema**: After modifying `prisma/schema.prisma`, run `npx prisma migrate dev` to apply changes.

### Project Structure

- `app/`: Next.js App Router pages and API routes.
- `components/`: Reusable React components.
- `lib/`: Utility functions and Prisma client instance.
- `prisma/`: Database schema and migrations.
- `public/`: Static assets.

## Technologies

- [Next.js](https://nextjs.org/) - React Framework
- [Prisma](https://www.prisma.io/) - ORM
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI SDK 5.0 (Core & React)
- [Google Gemini](https://ai.google.dev/) - LLM Provider
