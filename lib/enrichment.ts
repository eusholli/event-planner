/**
 * Mock Enrichment Service
 * Simulates finding LinkedIn URLs and generating bios using external APIs.
 */

export async function findLinkedInUrl(name: string, company: string): Promise<string | null> {
    console.log(`[Mock Search] Looking for LinkedIn URL for ${name} at ${company}...`)
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Mock logic: Return a dummy URL if not provided
    return `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, '-')}`
}

export async function generateBio(name: string, company: string, linkedinUrl: string): Promise<string> {
    console.log(`[Mock GenAI] Generating bio for ${name} based on ${linkedinUrl}...`)
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Mock logic: Generate a generic bio
    return `${name} is a seasoned professional at ${company}. With a strong background in their field, they bring valuable expertise and leadership to the team. (Generated from ${linkedinUrl})`
}
