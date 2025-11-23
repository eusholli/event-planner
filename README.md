# Event Planner

A comprehensive web application for managing events, attendees, and schedules. Built with Next.js, Prisma, and Tailwind CSS.

## 📖 User Manual

For a detailed guide on how to use the application features, please refer to the **[User Manual](USER_MANUAL.md)**.

## Features

- **Dashboard**: Real-time overview of event statistics.
- **Attendee Management**: Add, edit, and track event attendees.
- **AI-Powered Auto Complete**: Use Google Gemini to automatically populate attendee professional details.
- **Schedule Management**: Drag-and-drop interface for organizing meetings and sessions.
- **Data Management**: Import, Export, and Reset database capabilities.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
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
- [Google Gemini API](https://ai.google.dev/) - AI Integration
