
import { defineConfig } from '@prisma/config'
import 'dotenv/config'

const url = process.env.POSTGRES_URL_NON_POOLING
console.log('Prisma Config URL:', url ? (url.substring(0, 15) + '...') : 'UNDEFINED')

export default defineConfig({
    datasource: {
        url
    }
})
