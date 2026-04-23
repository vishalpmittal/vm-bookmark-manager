# VM Bookmarks Manager

A personal bookmark manager that runs entirely in the browser — no server, no account, no cloud. Your bookmarks are stored as simple CSV files on your local disk.

## Features

- **Add, edit, and delete bookmarks** with URL, title, description, notes, tags, and folder assignment
- **Auto-fetch page titles** from URLs — no need to type them manually
- **Organize into folders** with drag-free simplicity; nested folder support
- **Full-text search** across titles, URLs, descriptions, notes, and tags
- **Smart sorting** — most recently used bookmarks and most accessed folders surface first
- **Notes** — attach free-form notes to any bookmark; expand/collapse inline
- **Auto-archival** — bookmarks not visited in 90 days are automatically moved to an Archive folder, tagged with their original folder name for easy reference
- **Import/Export** — import bookmarks from any browser (Chrome, Firefox, Edge) via the standard Netscape HTML format, and export your bookmarks back out
- **Folder sorting** — sort folders by most used, least used, or alphabetically via a dropdown in the sidebar
- **Hover details** — hover over any bookmark card to see a popup with full details: URL, description, folder, tags, notes, and access stats
- **Duplicate detection** — warns you when adding a bookmark with a URL that already exists, showing the existing bookmark's title and folder
- **Persistent storage** — data lives in two CSV files (`bookmarks.csv` and `folders.csv`) that you own and control
- **No dependencies at runtime** — a single HTML file and one JS bundle; works offline

## Requirements

- **Browser**: Google Chrome 90+ or Microsoft Edge 90+ (required for the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API))
- Firefox and Safari are **not supported** (they lack the File System Access API)

## Usage Guide

### 1. Get the files

Download or clone this repository to your machine.

If you want to build from source (optional — `dist/app.js` is pre-built):

```bash
npm install
npm run build
```

### 2. Open the app

#### macOS

Open Finder, navigate to the project folder, and double-click `index.html`. If it doesn't open in Chrome/Edge by default:

- Right-click `index.html` > **Open With** > **Google Chrome** (or **Microsoft Edge**)

Or from Terminal:

```bash
open -a "Google Chrome" index.html
```

#### Windows

Open File Explorer, navigate to the project folder, and double-click `index.html`. If it doesn't open in Chrome/Edge by default:

- Right-click `index.html` > **Open with** > **Google Chrome** (or **Microsoft Edge**)

Or from Command Prompt / PowerShell:

```cmd
start chrome index.html
```

#### Linux

From a terminal, navigate to the project folder and run:

```bash
google-chrome index.html
# or
chromium-browser index.html
```

Or right-click `index.html` in your file manager and open with Chrome/Chromium.

### 3. Select your data folder

On first launch, you'll see a loading screen with an **"Open Data Folder"** button.

1. Click **"Open Data Folder"**
2. Select (or create) an empty folder where your bookmark data will be stored
3. Grant read/write permission when prompted

The app will remember this folder for future visits. You can change it anytime using the **"Data Folder"** button in the header.

### 4. Start bookmarking

- Click **"+ Add Bookmark"** to save a new bookmark — just paste the URL and the title is fetched automatically
- Use **"+"** in the sidebar to create folders
- Click a bookmark title to open it (this updates its usage stats)
- Use the search bar to filter across all bookmark fields
- Bookmarks not accessed for 90 days are automatically archived on app launch

## Distribution

Run `./build.sh` to produce all distributions in the `artifacts/` folder. Requires Node.js and `zip`.

### Local Browser (zip)

1. Download or build `artifacts/vm-bookmarks-local.zip`
2. Extract the zip
3. Open `index.html` in Chrome or Edge
4. Click **"Open Data Folder"** and select the `bookmarks-data/` folder inside the extracted directory to load sample data

### Docker

```bash
cd artifacts/docker
docker build -t vm-bookmarks .
docker run -p 8080:80 vm-bookmarks
```

Open [http://localhost:8080](http://localhost:8080) in Chrome or Edge. To use the sample data, download the CSV files from `http://localhost:8080/bookmarks-data/`, save them to a local folder, then point the app at that folder.

### GCP (Terraform + Cloud Run)

Prerequisites: [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated, Docker daemon running, [Terraform](https://developer.hashicorp.com/terraform/install) installed.

```bash
cd artifacts/terraform/gcp
terraform init
terraform apply -var='project_id=YOUR_GCP_PROJECT'
```

This creates an Artifact Registry repo, builds and pushes the Docker image, and deploys to Cloud Run. The public URL is printed as `service_url` in the output. Defaults to `us-central1`; override with `-var='region=europe-west1'`.

To tear down:

```bash
terraform destroy -var='project_id=YOUR_GCP_PROJECT'
```

## Data Storage

Your bookmarks are stored in two plain CSV files inside the data folder you selected:

- `bookmarks.csv` — all your bookmarks
- `folders.csv` — your folder structure

These are standard CSV files. You can open, edit, or back them up with any text editor or spreadsheet app.
