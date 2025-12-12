import jsPDF from 'jspdf'
import moment from 'moment'

interface Meeting {
    id: string
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    resourceId: string
    attendees: { id: string, name: string, company?: string, isExternal?: boolean, bio?: string, companyDescription?: string }[]
    purpose: string
    status: string
    tags: string[]
    createdBy?: string
    requesterEmail?: string
    meetingType?: string
    otherDetails?: string
}

export const generateBriefingBook = (meeting: Meeting, roomName: string) => {
    const doc = new jsPDF()
    renderMeetingDetails(doc, meeting, roomName, true)

    // Save
    const safeTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    const filename = `Briefing_${meeting.date || 'NoDate'}_${safeTitle}.pdf`
    doc.save(filename)
}

export const generateMultiMeetingBriefingBook = (title: string, subtitle: string, meetings: { meeting: Meeting, roomName: string }[]) => {
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
    meetings.forEach((item, index) => {
        doc.addPage()
        renderMeetingDetails(doc, item.meeting, item.roomName, false)
    })

    // Add page numbers
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor('#AAAAAA')
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 10)
    }

    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    const timestamp = moment().format('YYYYMMDD-HHmmss')
    doc.save(`${safeTitle}_${timestamp}.pdf`)
}

const renderMeetingDetails = (doc: jsPDF, meeting: Meeting, roomName: string, addPageNumbers: boolean) => {
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

    // Helper to add a section header
    const addSectionHeader = (title: string) => {
        yPos += 5
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, yPos, pageWidth - margin, yPos)
        yPos += 10
        addText(title, 14, 'bold', '#333333')
        yPos += 2
    }

    // Helper to check for page break
    const checkPageBreak = (heightNeeded: number = 20) => {
        if (yPos + heightNeeded > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage()
            yPos = 20
        }
    }

    // Helper to add a field
    const addField = (label: string, value: string | undefined | null) => {
        if (!value) return
        checkPageBreak()
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor('#555555')
        doc.text(label + ':', margin, yPos)

        doc.setFont('helvetica', 'normal')
        doc.setTextColor('#000000')
        const splitValue = doc.splitTextToSize(value, pageWidth - (margin * 2) - 40)
        doc.text(splitValue, margin + 40, yPos)

        yPos += (splitValue.length * 5) + 3
    }

    // --- Header ---
    doc.setFillColor(63, 81, 181) // Indigo color
    doc.rect(0, 0, pageWidth, 40, 'F')

    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#FFFFFF')
    doc.text('Meeting Briefing', margin, 25)

    yPos = 55

    // --- Meeting Overview ---
    addText(meeting.title, 18, 'bold')

    let dateStr = 'Date Not Set'
    if (meeting.date) {
        dateStr = moment(meeting.date).format('dddd, MMMM D, YYYY')
    }

    let timeStr = 'Time Not Set'
    if (meeting.startTime && meeting.endTime) {
        // Handle both full ISO strings and simple time strings
        const startM = meeting.startTime.includes('T') ? moment(meeting.startTime) : moment(meeting.date + 'T' + meeting.startTime)
        const endM = meeting.endTime.includes('T') ? moment(meeting.endTime) : moment(meeting.date + 'T' + meeting.endTime)
        timeStr = `${startM.format('h:mm A')} - ${endM.format('h:mm A')}`
    }

    addText(`${dateStr}  |  ${timeStr}`, 12, 'normal', '#666666')
    addText(`Location: ${roomName}`, 12, 'normal', '#666666')

    if (meeting.meetingType) {
        yPos += 2
        doc.setFillColor(240, 240, 240)
        doc.roundedRect(margin, yPos - 4, doc.getTextWidth(meeting.meetingType) + 10, 8, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setTextColor('#333333')
        doc.text(meeting.meetingType, margin + 5, yPos + 1)
        yPos += 10
    }

    // --- Purpose / Agenda ---
    if (meeting.purpose) {
        addSectionHeader('Purpose & Agenda')
        addText(meeting.purpose, 11)
    }

    // --- Attendees ---
    checkPageBreak(40)
    addSectionHeader('Attendees')

    const internalAttendees = meeting.attendees.filter(a => !a.isExternal)
    const externalAttendees = meeting.attendees.filter(a => a.isExternal)

    if (externalAttendees.length > 0) {
        checkPageBreak()
        addText('External Guests', 11, 'bold', '#444444')

        externalAttendees.forEach(a => {
            checkPageBreak(30)
            let text = `• ${a.name}`
            if (a.company) text += ` (${a.company})`
            addText(text, 10, 'bold')

            if (a.bio) {
                addText(`  Bio: ${a.bio}`, 9, 'italic', '#555555')
            }
            yPos += 2 // Add some spacing between attendees
        })
        yPos += 5
    }

    if (internalAttendees.length > 0) {
        checkPageBreak()
        addText('Internal Attendees', 11, 'bold', '#444444')
        internalAttendees.forEach(a => {
            checkPageBreak()
            addText(`• ${a.name}`, 10)
            yPos -= 2 // Tighten list
        })
        yPos += 5
    }

    if (meeting.attendees.length === 0) {
        addText('No attendees listed.', 10, 'italic', '#888888')
    }

    // --- Participating Companies ---
    const companies = new Map<string, string>()
    externalAttendees.forEach(a => {
        if (a.company && a.companyDescription) {
            companies.set(a.company, a.companyDescription)
        }
    })

    if (companies.size > 0) {
        checkPageBreak(40)
        addSectionHeader('Participating Companies')
        companies.forEach((description, company) => {
            checkPageBreak(30)
            addText(company, 11, 'bold', '#444444')
            addText(description, 10, 'normal', '#000000')
            yPos += 3
        })
    }



    if (addPageNumbers) {
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            doc.setFontSize(8)
            doc.setTextColor('#AAAAAA')
            doc.text(`Generated on ${moment().format('MMM D, YYYY h:mm A')}`, margin, doc.internal.pageSize.getHeight() - 10)
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 10)
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
