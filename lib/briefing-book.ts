import jsPDF from 'jspdf'
import moment from 'moment'

interface Meeting {
    id: string
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    resourceId: string
    attendees: { id: string, name: string, company?: string, isExternal?: boolean, bio?: string, companyDescription?: string, imageUrl?: string }[]
    purpose: string
    status: string
    tags: string[]
    createdBy?: string
    requesterEmail?: string
    meetingType?: string
    otherDetails?: string
}

const loadImage = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        // Use our own proxy to avoid CORS issues from external storage
        img.src = `/api/image-proxy?url=${encodeURIComponent(url)}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            } else {
                resolve(null);
            }
        };
        img.onerror = () => {
            console.warn('Failed to load image for PDF:', url);
            resolve(null);
        };
    });
}

export const generateBriefingBook = async (meeting: Meeting, roomName: string) => {
    const doc = new jsPDF()
    await renderMeetingDetails(doc, meeting, roomName, true)

    // Save
    const safeTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    const timestamp = moment().format('YYYYMMDD-HHmmss')
    const filename = `Briefing_${safeTitle}_${timestamp}.pdf`
    doc.save(filename)
}

export const generateMultiMeetingBriefingBook = async (title: string, subtitle: string, meetings: { meeting: Meeting, roomName: string }[], filenamePrefix?: string) => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20

    // Cover Page
    doc.setFillColor(63, 81, 181) // Indigo color
    doc.rect(0, 0, pageWidth, 60, 'F')

    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#FFFFFF')
    doc.text(title, margin, 30)

    doc.setFontSize(16)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#E0E0E0')
    doc.text(subtitle, margin, 45)

    doc.setFontSize(12)
    doc.setTextColor('#333333')
    doc.text(`Generated on ${moment().format('MMMM D, YYYY')}`, margin, 80)
    doc.text(`Total Meetings: ${meetings.length}`, margin, 90)

    // Render each meeting
    for (const item of meetings) {
        doc.addPage()
        await renderMeetingDetails(doc, item.meeting, item.roomName, false)
    }

    // Add page numbers
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor('#AAAAAA')
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 10)
    }

    const baseName = filenamePrefix || title
    const safeTitle = baseName.replace(/[^a-z0-9]/gi, '_').substring(0, 50)
    const timestamp = moment().format('YYYYMMDD-HHmmss')
    doc.save(`${safeTitle}_${timestamp}.pdf`)
}

const renderMeetingDetails = async (doc: jsPDF, meeting: Meeting, roomName: string, addPageNumbers: boolean) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    let yPos = 20

    // --- Dynamic Spacing Constants ---
    // These are minimums; actual spacing depends on content
    const GAP_SMALL = 3
    const GAP_MEDIUM = 6
    const GAP_SECTION_TOP = 10
    const GAP_SECTION_BOTTOM = 5

    // --- Helper Functions ---
    const checkPageBreak = (heightNeeded: number = 20) => {
        if (yPos + heightNeeded > pageHeight - 20) {
            doc.addPage()
            yPos = 20
            return true
        }
        return false
    }

    const addSectionHeader = (title: string, marginTop = GAP_SECTION_TOP) => {
        yPos += marginTop
        checkPageBreak(15) // Reduced header check requirement

        doc.setFillColor(245, 245, 245)
        doc.rect(margin, yPos, pageWidth - (margin * 2), 8, 'F') // Smaller header bar

        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor('#333333')
        doc.text(title.toUpperCase(), margin + 5, yPos + 5.5) // Centered visually

        yPos += 8 + GAP_SECTION_BOTTOM
    }

    // --- Header Banner ---
    doc.setFillColor(63, 81, 181)
    doc.rect(0, 0, pageWidth, 40, 'F')

    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#FFFFFF')
    doc.text('Meeting Briefing', margin, 20)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#E0E0E0')
    doc.text(`Generated: ${moment().format('MMM D, YYYY')}`, margin, 30)

    yPos = 55

    // --- Meeting Info Grid ---
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#1f2937')

    // Title
    const titleLines = doc.splitTextToSize(meeting.title, pageWidth - (margin * 2))
    doc.text(titleLines, margin, yPos)
    yPos += (titleLines.length * 8) + GAP_MEDIUM

    // Grid Container
    const gridY = yPos
    const colWidth = (pageWidth - (margin * 2)) / 2

    // Left Col: Date & Time
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#6b7280')
    doc.text('DATE & TIME', margin, yPos)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#111827')

    let dateStr = 'Date Not Set'
    let timeStr = 'Time Not Set'
    if (meeting.date) {
        dateStr = moment(meeting.date).format('ddd, MMM D, YYYY')
    }
    if (meeting.startTime && meeting.endTime) {
        const startM = meeting.startTime.includes('T') ? moment(meeting.startTime) : moment(`${meeting.date}T${meeting.startTime}`)
        const endM = meeting.endTime.includes('T') ? moment(meeting.endTime) : moment(`${meeting.date}T${meeting.endTime}`)
        timeStr = `${startM.format('h:mm A')} - ${endM.format('h:mm A')}`
    }

    doc.text(dateStr, margin, yPos + 5)
    doc.text(timeStr, margin, yPos + 10)

    // Right Col: Location & Type
    const rightColX = margin + colWidth
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#6b7280')
    doc.text('LOCATION', rightColX, yPos)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#111827')
    doc.text(roomName, rightColX, yPos + 5)

    if (meeting.meetingType) {
        doc.setFontSize(9)
        doc.setFillColor(238, 242, 255)
        doc.setDrawColor(199, 210, 254)
        doc.roundedRect(rightColX, yPos + 9, doc.getTextWidth(meeting.meetingType) + 8, 6, 1.5, 1.5, 'FD')
        doc.setTextColor(67, 56, 202)
        doc.text(meeting.meetingType, rightColX + 4, yPos + 13)
    }

    // Determine grid height based on content
    // Date/Time (2 lines) vs Location (1 line) + Tag
    // Base is 3 lines text -> approx 15 height + label
    const gridContentHeight = meeting.meetingType ? 20 : 15
    yPos += gridContentHeight + GAP_SECTION_TOP

    // --- Purpose ---
    if (meeting.purpose) {
        doc.setDrawColor(229, 231, 235)
        doc.line(margin, yPos, pageWidth - margin, yPos)
        yPos += GAP_MEDIUM

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor('#6b7280')
        doc.text('PURPOSE', margin, yPos)
        yPos += 5

        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor('#374151')
        const purposeLines = doc.splitTextToSize(meeting.purpose, pageWidth - (margin * 2))
        doc.text(purposeLines, margin, yPos)
        yPos += (purposeLines.length * 5) // Tight line spacing
    }

    // --- Attendees ---
    const internalAttendees = meeting.attendees.filter(a => !a.isExternal)
    const externalAttendees = meeting.attendees.filter(a => a.isExternal)

    if (externalAttendees.length > 0) {
        // Only add top margin if we had predecessor content
        addSectionHeader('External Guests', GAP_SECTION_TOP)

        for (const a of externalAttendees) {
            checkPageBreak(30)

            const cardStartY = yPos
            let contentStartX = margin

            // Image
            const IMG_SIZE = 22
            if (a.imageUrl) {
                try {
                    const imgData = await loadImage(a.imageUrl)
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', margin, yPos, IMG_SIZE, IMG_SIZE)
                        doc.setDrawColor(229, 231, 235)
                        doc.rect(margin, yPos, IMG_SIZE, IMG_SIZE)
                        contentStartX += (IMG_SIZE + GAP_MEDIUM)
                    }
                } catch (e) {
                    console.error('Failed to load image', e)
                }
            }

            // Name
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor('#111827')
            doc.text(`${a.name}`, contentStartX, yPos + 4)

            let metaY = yPos + 9
            if (a.company) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor('#4b5563')
                doc.text(a.company.toUpperCase(), contentStartX, metaY)
                metaY += 5
            }

            // Bio
            let bioHeight = 0
            if (a.bio) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'italic')
                doc.setTextColor('#6b7280')
                const bioLines = doc.splitTextToSize(a.bio, pageWidth - contentStartX - margin)
                doc.text(bioLines, contentStartX, metaY)
                bioHeight = bioLines.length * 3.5
            }

            // Dynamic Row Height Calculation
            const textHeight = (metaY - yPos) + bioHeight
            // If image exists, row must be at least image height
            // If no image, row is just text height
            const contentHeight = a.imageUrl ? Math.max(IMG_SIZE, textHeight) : textHeight

            // Add minimal padding between rows (4 units)
            yPos += contentHeight + 4
        }
    }

    if (internalAttendees.length > 0) {
        addSectionHeader('Internal Attendees', GAP_SECTION_TOP)

        for (const a of internalAttendees) {
            checkPageBreak(12)

            let contentStartX = margin
            const IMG_SIZE = 16
            if (a.imageUrl) {
                try {
                    const imgData = await loadImage(a.imageUrl)
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', margin, yPos, IMG_SIZE, IMG_SIZE)
                        doc.setDrawColor(229, 231, 235)
                        doc.rect(margin, yPos, IMG_SIZE, IMG_SIZE)
                        contentStartX += (IMG_SIZE + GAP_SMALL)
                    }
                } catch (e) { }
            }

            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor('#111827')

            // Calculate width using the correct Bold/10 font settings BEFORE changing them
            const nameWidth = doc.getTextWidth(a.name)
            doc.text(a.name, contentStartX, yPos + 4)

            if (a.company) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'normal')
                doc.setTextColor('#6b7280')
                // Use the pre-calculated width + padding (replaced dash with clean spacing)
                doc.text(a.company, contentStartX + nameWidth + 5, yPos + 4)
            }

            const contentHeight = a.imageUrl ? Math.max(IMG_SIZE, 5) : 5
            yPos += contentHeight + GAP_SMALL
        }
    }

    // --- Footer Pagination ---
    if (addPageNumbers) {
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            doc.setFontSize(8)
            doc.setTextColor('#9ca3af')
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, pageHeight - 10)
        }
    }
}

export const generateScheduleBriefing = (title: string, subtitle: string, meetings: any[]) => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let yPos = 20

    // Helper to add text and advance yPos
    const addText = (text: string, fontSize: number, fontStyle: string = 'normal', color: string = '#000000') => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color)

        const splitText = doc.splitTextToSize(text, pageWidth - (margin * 2))
        doc.text(splitText, margin, yPos)
        yPos += (splitText.length * fontSize * 0.5) + 5
    }

    // Header
    doc.setFillColor(63, 81, 181) // Indigo color
    doc.rect(0, 0, pageWidth, 40, 'F')

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#FFFFFF')
    doc.text(title, margin, 20)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, margin, 30)

    yPos = 50

    if (meetings.length === 0) {
        addText("No meetings scheduled.", 12, 'normal', '#666666')
    } else {
        meetings.forEach((meeting: any) => {
            // Check page break
            if (yPos > 250) {
                doc.addPage()
                yPos = 20
            }

            // Meeting Header
            doc.setFillColor(240, 240, 240)
            doc.rect(margin, yPos - 6, pageWidth - (margin * 2), 10, 'F')

            const timeStr = new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const dateStr = new Date(meeting.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor('#333333')
            doc.text(`${dateStr} ${timeStr} - ${meeting.title}`, margin + 2, yPos)
            yPos += 10

            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor('#000000')
            doc.text(`Room: ${meeting.room?.name || 'TBD'}`, margin, yPos)
            yPos += 5

            if (meeting.purpose) {
                doc.text(`Purpose: ${meeting.purpose}`, margin, yPos)
                yPos += 5
            }

            yPos += 2

            // Participants
            const attendees = meeting.attendees || []
            if (attendees.length > 0) {
                doc.setFontSize(10)
                doc.setFont('helvetica', 'bold')
                doc.text("Participants:", margin, yPos)
                yPos += 5

                attendees.forEach((p: any) => {
                    if (yPos > 270) {
                        doc.addPage()
                        yPos = 20
                    }

                    let text = `• ${p.name}`
                    if (p.company) text += ` (${p.company})`

                    doc.setFont('helvetica', 'normal')
                    doc.text(text, margin + 4, yPos)
                    yPos += 5
                })
            }

            yPos += 10
        })
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor('#AAAAAA')
        doc.text(`Generated on ${moment().format('MMM D, YYYY h:mm A')}`, margin, doc.internal.pageSize.getHeight() - 10)
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 10)
    }

    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    doc.save(`${safeTitle}.pdf`)
}
