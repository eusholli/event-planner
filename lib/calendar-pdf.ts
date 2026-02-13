import jsPDF from 'jspdf';
import moment from 'moment';

interface Room {
    id: string;
    name: string;
}

interface Attendee {
    id: string;
    name: string;
    company: string;
    isExternal?: boolean;
}

interface CalendarMeeting {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    resourceId?: string; // Room ID
    attendees: Attendee[];
    location?: string | null;
}

// Function to fetch the font file (reused from briefing-book.ts pattern)
const loadFont = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return arrayBufferToBase64(buffer);
}

// Helper to convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export const generateCalendarViewPDF = async (meetings: CalendarMeeting[], rooms: Room[]) => {
    // 1. Filter out external meetings and invalid times
    const validMeetings = meetings.filter(m =>
        m.start && m.end && m.resourceId && m.resourceId !== 'external'
    );

    if (validMeetings.length === 0) {
        alert("No meetings to export (matches criteria: internal rooms only).");
        return;
    }

    // 2. Group meetings by Date
    const meetingsByDate: { [key: string]: CalendarMeeting[] } = {};
    validMeetings.forEach(m => {
        const dateKey = moment(m.start).format('YYYY-MM-DD');
        if (!meetingsByDate[dateKey]) {
            meetingsByDate[dateKey] = [];
        }
        meetingsByDate[dateKey].push(m);
    });

    const sortedDates = Object.keys(meetingsByDate).sort();

    // 3. Setup PDF (Landscape)
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    // Load Font
    try {
        const fontBase64 = await loadFont('/fonts/MPLUS1p-Regular.ttf');
        if (fontBase64) {
            doc.addFileToVFS('MPLUS1p-Regular.ttf', fontBase64);
            doc.addFont('MPLUS1p-Regular.ttf', 'MPLUS1p', 'normal');
            doc.setFont('MPLUS1p');
        }
    } catch (e) {
        console.error('Failed to load custom font, falling back to default', e);
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const headerHeight = 20;

    // Grid config
    const timeColWidth = 15;
    const startHour = 8;
    const endHour = 19;
    const gridWidth = pageWidth - margin - margin - timeColWidth;
    const colWidth = gridWidth / rooms.length;

    // Font Constants
    const titleFontSize = 8;
    const baseFontSize = 7;
    const lineHeightRatio = 1.2;
    // Helper to get mm height from fontSize(pt)
    const getLineHeight = (pt: number) => pt * 0.3527 * lineHeightRatio;

    const titleLineHeight = getLineHeight(titleFontSize);
    const baseLineHeight = getLineHeight(baseFontSize);
    const padding = 2; // mm inside box

    // 4. Render Loop Per Date
    for (let d = 0; d < sortedDates.length; d++) {
        const dateKey = sortedDates[d];
        const dayMeetings = meetingsByDate[dateKey];

        if (d > 0) doc.addPage();

        // --- A. Pre-calculation: Hour Scales (Two-Pass) ---
        // hourScales[h] = mm per minute required for hour h (0-23)
        const hourScales: number[] = Array.from({ length: 24 }).fill(0.3) as number[]; // Base min density

        // Helper to calculate content height
        const calculateMeetingContentHeight = (m: CalendarMeeting) => {
            const availWidth = colWidth - (padding * 2);
            doc.setFontSize(titleFontSize);
            const titleLines = doc.splitTextToSize(m.title, availWidth);
            doc.setFontSize(baseFontSize);
            const timeStr = `${moment(m.start).format('h:mm A')} - ${moment(m.end).format('h:mm A')}`;
            const timeLines = doc.splitTextToSize(timeStr, availWidth);
            return (titleLines.length * titleLineHeight) +
                (timeLines.length * baseLineHeight) +
                (padding * 2) + 2;
        };

        // Pass 1: Single-Hour Meetings (Hard Constraints)
        dayMeetings.forEach(m => {
            const start = moment(m.start);
            const end = moment(m.end);
            if (start.hour() !== end.hour() && !(start.hour() === end.hour() - 1 && end.minute() === 0)) return; // Skip multi-hour

            const durationMins = Math.max(end.diff(start, 'minutes'), 1);
            const contentHeight = calculateMeetingContentHeight(m);
            const density = contentHeight / durationMins;

            const h = start.hour();
            if (h >= startHour && h <= endHour) {
                hourScales[h] = Math.max(hourScales[h], density);
            }
        });

        // Pass 2: Multi-Hour Meetings (Boost if needed)
        dayMeetings.forEach(m => {
            const start = moment(m.start);
            const end = moment(m.end);
            // Check if strictly multi-hour (spans across hour boundary)
            if (start.hour() === end.hour() || (start.hour() === end.hour() - 1 && end.minute() === 0)) return; // Skip single-hour (already handled)

            const contentHeight = calculateMeetingContentHeight(m);
            const durationMins = Math.max(end.diff(start, 'minutes'), 1);

            // Calculate Existing Layout Height
            let existingHeight = 0;
            // Similar integration loop
            const sH = start.hour();
            const eH = end.hour();
            const sM = start.minute();
            const eM = end.minute();

            // Head
            existingHeight += (60 - sM) * hourScales[sH];
            // Body
            for (let h = sH + 1; h < eH; h++) {
                existingHeight += (60 * hourScales[h]);
            }
            // Tail
            existingHeight += (eM * hourScales[eH]);

            if (existingHeight < contentHeight) {
                // We need more space. Distribute deficit density across all touched hours?
                // Or just boost evenly.
                const deficit = contentHeight - existingHeight;
                const boostDensity = deficit / durationMins;

                // Add boost to all valid hours touched
                let curr = start.clone();
                while (curr.isBefore(end)) {
                    const h = curr.hour();
                    if (h >= startHour && h <= endHour) {
                        hourScales[h] += boostDensity;
                    }
                    curr.add(1, 'hour').startOf('hour');
                }
            }
        });

        // --- B. Build Atomic Hour Groups ---
        // Group hours [8], [9,10], [11] etc. if meetings straddle them.
        const hourGroups: number[][] = [];
        let currentGroup: number[] = [];

        for (let h = startHour; h <= endHour; h++) {
            currentGroup.push(h);

            // detailed check: Does any meeting exist that starts <= h and ends > h+1?
            // Meaning it crosses the boundary between h and h+1.
            const crossesBoundary = dayMeetings.some(m => {
                const ms = moment(m.start);
                const me = moment(m.end);
                // If meeting starts in/before this group and ends after this hour
                // Strictly: Starts before (h+1):00 and Ends after (h+1):00
                const barrier = moment(dateKey).hour(h + 1).startOf('hour');
                return ms.isBefore(barrier) && me.isAfter(barrier);
            });

            if (!crossesBoundary) {
                // Safe to break group here
                hourGroups.push(currentGroup);
                currentGroup = [];
            }
        }
        if (currentGroup.length > 0) hourGroups.push(currentGroup);

        // --- C. Render Groups with Page Logic ---
        let currentY = margin + headerHeight; // Start Y
        // Draw Header on first page of date
        const drawDateHeader = () => {
            doc.setFontSize(18);
            doc.setTextColor(0, 0, 0);
            doc.text(`Daily Schedule: ${moment(dateKey).format('dddd, MMMM D, YYYY')}`, margin, margin + 10);
        }
        drawDateHeader();

        // Helper to draw Grid Headers
        const drawGridHeaders = (yPos: number) => {
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.setDrawColor(200, 200, 200);
            rooms.forEach((room, index) => {
                const x = margin + timeColWidth + (index * colWidth);
                doc.text(room.name, x + (colWidth / 2), yPos - 2, { align: 'center' });
                // Vert lines will be drawn per row to handle page breaks cleanly
            });
        }
        drawGridHeaders(currentY);

        // Render Groups
        for (const group of hourGroups) {
            // Calculate height of this group
            let groupHeight = 0;
            group.forEach(h => {
                groupHeight += hourScales[h] * 60;
            });

            // Check Page Fit
            if (currentY + groupHeight > pageHeight - margin) {
                doc.addPage();
                currentY = margin + headerHeight;
                drawDateHeader();
                drawGridHeaders(currentY);
            }

            // Render the Group
            // 1. Grid Rows & Time Labels
            doc.setDrawColor(220, 220, 220); // Light gray
            doc.setTextColor(100, 100, 100);
            doc.setFontSize(8);

            let groupValidY = currentY; // Track Y start of this group

            group.forEach(h => {
                const hHeight = hourScales[h] * 60;
                const rowBottom = currentY + hHeight;

                // Horizontal Line (Bottom of hour)
                doc.line(margin + timeColWidth, rowBottom, pageWidth - margin, rowBottom);

                // Time Label
                const timeLabel = moment().hour(h).minute(0).format('h A');
                doc.text(timeLabel, margin + timeColWidth - 2, currentY + 4, { align: 'right' });

                // Vertical Lines for this row
                doc.setDrawColor(200, 200, 200);
                rooms.forEach((_, idx) => {
                    const rx = margin + timeColWidth + (idx * colWidth);
                    // Left line of room
                    doc.line(rx, currentY, rx, rowBottom);
                    // Right line of last room
                    if (idx === rooms.length - 1) {
                        doc.line(rx + colWidth, currentY, rx + colWidth, rowBottom);
                    }
                });

                // Advance Y for grid loop purely for structure, but we need exact Y map
                currentY += hHeight;
            });

            // 2. Render Meetings in this Group
            // We need to render any meeting that *starts* in this group, OR intersects it?
            // Since we grouped by connectivity, any meeting touching this group is fully contained 
            // OR fully handled by this group block logic (since we only break on clean gaps).

            const groupStartHour = group[0];
            const groupEndHour = group[group.length - 1]; // inclusive

            const groupMeetings = dayMeetings.filter(m => {
                const h = moment(m.start).hour();
                return h >= groupStartHour && h <= groupEndHour;
                // Note: overlapping meetings from Previous group?
                // Logic check: "Atomic Groups" merge connected hours. 
                // So no meeting should straddle Group A and Group B.
                // Therefore, if a meeting starts in this group, it ends in this group.
            });

            groupMeetings.forEach(meeting => {
                const roomIndex = rooms.findIndex(r => r.id === meeting.resourceId);
                if (roomIndex === -1) return;

                const start = moment(meeting.start);
                const end = moment(meeting.end);

                // Calculate Y pos relative to Group Start
                // We need to sum up scales of hours before the meeting start within the group
                // Plus the minute-offset within the start hour

                let meetingTopY = groupValidY;

                // Add full hours height for hours in group before start-hour
                for (let h = groupStartHour; h < start.hour(); h++) {
                    meetingTopY += (hourScales[h] * 60);
                }

                // Add offset for start minute
                meetingTopY += (start.minute() * hourScales[start.hour()]);

                // Calculate Height
                // Iterate hours touched
                let totalH = 0;
                let curr = start.clone();
                // We just need minute-by-minute density summation
                // Simplified: 
                // 1. Mins in Start Hour
                // 2. Mins in Middle Hours
                // 3. Mins in End Hour

                // Implementation: Iterate hour segments.

                const sH = start.hour();
                const eH = end.hour();
                const sM = start.minute();
                const eM = end.minute();

                if (sH === eH) {
                    // Same hour
                    totalH = (eM - sM) * hourScales[sH];
                } else {
                    // Start Hour remaining
                    totalH += (60 - sM) * hourScales[sH];
                    // Middle hours
                    for (let h = sH + 1; h < eH; h++) {
                        totalH += (60 * hourScales[h]);
                    }
                    // End Hour
                    totalH += (eM * hourScales[eH]);
                }

                // Draw Box
                const x = margin + timeColWidth + (roomIndex * colWidth);
                const width = colWidth - 1;

                doc.setFillColor(236, 240, 255);
                doc.rect(x + 0.5, meetingTopY, width, totalH, 'F');
                doc.setDrawColor(99, 102, 241);
                doc.rect(x + 0.5, meetingTopY, width, totalH, 'S');

                // Draw Content
                // Re-create content lines (duplication from sizing step but safer for context)
                doc.setTextColor(30, 30, 30);
                const availWidth = width - (padding * 2);
                const cx = x + padding;
                let cy = meetingTopY + padding + titleLineHeight - 1; // Approx baseline

                // Title
                doc.setFontSize(titleFontSize);
                doc.setFont('MPLUS1p', 'bold'); // fake bold if possible, or just normal
                const titleLines = doc.splitTextToSize(meeting.title, availWidth);
                doc.text(titleLines, cx, cy);
                cy += (titleLines.length * titleLineHeight);

                // Time
                doc.setFontSize(baseFontSize);
                doc.setFont('MPLUS1p', 'normal');
                doc.setTextColor(80, 80, 80);
                const timeStr = `${start.format('h:mm A')} - ${end.format('h:mm A')}`;
                doc.text(timeStr, cx, cy);
                cy += baseLineHeight;

            });

            // End of Group Loop
        }
    }

    // Save
    const timestamp = moment().format('YYYYMMDD-HHmmss');
    doc.save(`Calendar_View_Export_${timestamp}.pdf`);
};
