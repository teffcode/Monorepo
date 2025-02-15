import { Survey } from './types'
import { Octokit } from '@octokit/core'
import fetch from 'node-fetch'
import yaml from 'js-yaml'
import { readdir, readFile, lstat } from 'fs/promises'
import { logToFile } from './debug'
import path from 'path'

let allSurveys: Survey[] = []

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

// load locales if not yet loaded
export const loadOrGetSurveys = async (
    options: { forceReload?: boolean } = { forceReload: false }
) => {
    const { forceReload } = options

    if (forceReload || allSurveys.length === 0) {
        allSurveys = await loadSurveys()
    }
    return allSurveys
}

const options = {
    owner: 'Devographics',
    repo: 'surveys'
}
const listGitHubFiles = async (ghPath: string) => {
    const contents = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        ...options,
        path: ghPath
    })
    return contents.data as any[]
}

const getGitHubYamlFile = async (url: string) => {
    const response = await fetch(url)
    const contents = await response.text()
    try {
        const yamlContents: any = yaml.load(contents)
        return yamlContents
    } catch (error) {
        console.log(`// Error loading file ${url}`)
        console.log(error)
    }
}

export const loadFromGitHub = async () => {
    console.log(`-> loading surveys repo`)
    const surveys: Survey[] = []

    const repoDirContents = await listGitHubFiles('')

    // loop over repo contents and fetch raw yaml files
    for (const file of repoDirContents) {
        if (file.type === 'dir') {
            console.log(`// Loading survey ${file.name}…`)
            const editions: any[] = []
            let editionConfigYaml = {}
            const surveyDirContents = await listGitHubFiles(file.path)

            for (const file2 of surveyDirContents) {
                if (file2.name === 'config.yml') {
                    // found config.yml for survey
                    editionConfigYaml = await getGitHubYamlFile(file2.download_url)
                } else if (file2.type === 'dir') {
                    console.log(`    -> Edition ${file2.name}…`)
                    const editionsDirContents = await listGitHubFiles(file2.path)
                    let edition = {}
                    for (const file3 of editionsDirContents) {
                        if (file3.name === 'config.yml') {
                            // found config.yml for edition
                            const editionConfigYaml = await getGitHubYamlFile(file3.download_url)
                            edition = { ...edition, ...editionConfigYaml }
                        } else if (file3.name === 'questions.yml') {
                            // found config.yml for edition
                            const editionQuestionsYaml = await getGitHubYamlFile(file3.download_url)
                            edition = { ...edition, questions: editionQuestionsYaml }
                        }
                    }
                    editions.push(edition)
                }
            }
            const survey = { ...editionConfigYaml, editions }
            surveys.push(survey)
        }
    }
    return surveys
}

const excludeDirs = ['.git', '.DS_Store']

// when developing locally, load from local files
export const loadLocally = async () => {
    console.log(`-> loading surveys locally`)

    const surveys: Survey[] = []

    const surveysDirPath = path.resolve(`../../devographics-surveys/`)
    const surveysDirs = await readdir(surveysDirPath)

    // loop over dir contents and fetch raw yaml files
    for (const surveyDirName of surveysDirs) {
        const editions = []
        const surveyDirPath = surveysDirPath + '/' + surveyDirName
        const stat = await lstat(surveyDirPath)
        if (!excludeDirs.includes(surveyDirName) && stat.isDirectory()) {
            console.log(`// Loading survey ${surveyDirName}…`)

            const surveyConfigContents = await readFile(surveyDirPath + '/config.yml', 'utf8')
            const surveyConfigYaml: any = yaml.load(surveyConfigContents)
            const editionsDirs = await readdir(surveyDirPath)

            for (const editionDirName of editionsDirs) {
                const editionDirPath = `${surveyDirPath}/${editionDirName}`
                const stat = await lstat(editionDirPath)
                if (!excludeDirs.includes(editionDirName) && stat.isDirectory()) {
                    console.log(`    -> Edition ${editionDirName}…`)
                    let edition
                    try {
                        const editionConfigContents = await readFile(
                            editionDirPath + '/config.yml',
                            'utf8'
                        )
                        const editionConfigYaml: any = yaml.load(editionConfigContents)
                        edition = editionConfigYaml
                    } catch (error) {}
                    try {
                        const editionQuestionsContents = await readFile(
                            editionDirPath + '/questions.yml',
                            'utf8'
                        )
                        const editionQuestionsYaml: any = yaml.load(editionQuestionsContents)
                        edition.questions = editionQuestionsYaml
                    } catch (error) {}
                    editions.push(edition)
                }
            }

            const survey = { ...surveyConfigYaml, editions }
            surveys.push(survey)
        }
    }
    return surveys
}

// load locales contents through GitHub API or locally
export const loadSurveys = async () => {
    console.log('// loading surveys')

    const surveys: Survey[] =
        process.env.LOAD_DATA === 'local' ? await loadLocally() : await loadFromGitHub()
    console.log(`// done loading ${surveys.length} surveys`)

    return surveys
}

export const initSurveys = async () => {
    console.log('// initializing surveys')
    const surveys = await loadOrGetSurveys({ forceReload: true })
    logToFile('surveys.json', surveys, { mode: 'overwrite' })
    return surveys
}

export const getSurveys = async () => {
    return allSurveys
}

// Look up entities by id, name, or aliases (case-insensitive)
// export const getEntity = async ({ id }: { id: string | number }) => {
//     const entities = await loadOrGetSurveys()

//     if (!id || typeof id !== 'string') {
//         return
//     }

//     const lowerCaseId = id.toLowerCase()
//     // some entities are only for normalization and should not be made available through API
//     const entity = entities
//         .filter(e => !e.normalizationOnly)
//         .find(e => {
//             return (
//                 (e.id && e.id.toLowerCase() === lowerCaseId) ||
//                 (e.id && e.id.toLowerCase().replace(/\-/g, '_') === lowerCaseId) ||
//                 (e.name && e.name.toLowerCase() === lowerCaseId) ||
//                 (e.aliases && e.aliases.find((a: string) => a.toLowerCase() === lowerCaseId))
//             )
//         })

//     return entity
// }

export default allSurveys
