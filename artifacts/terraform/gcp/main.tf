terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  image_url = "${var.region}-docker.pkg.dev/${var.project_id}/vm-bookmarks/app:latest"
}

# --- Enable APIs ---

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

# --- Artifact Registry ---

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "vm-bookmarks"
  format        = "DOCKER"

  depends_on = [google_project_service.artifactregistry]
}

# --- Build & push Docker image ---

resource "null_resource" "docker_push" {
  triggers = {
    dockerfile = filemd5("../docker/Dockerfile")
    app_js     = filemd5("../docker/dist/app.js")
    index      = filemd5("../docker/index.html")
    styles     = filemd5("../docker/styles.css")
  }

  provisioner "local-exec" {
    command = <<-EOT
      gcloud auth configure-docker ${var.region}-docker.pkg.dev --quiet
      docker build -t ${local.image_url} ../docker/
      docker push ${local.image_url}
    EOT
  }

  depends_on = [google_artifact_registry_repository.repo]
}

# --- Cloud Run ---

resource "google_cloud_run_v2_service" "app" {
  name     = "vm-bookmarks"
  location = var.region

  template {
    containers {
      image = local.image_url

      ports {
        container_port = 80
      }

      resources {
        limits = {
          memory = "256Mi"
          cpu    = "1"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
  }

  depends_on = [
    google_project_service.run,
    null_resource.docker_push,
  ]
}

# --- Public access ---

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
