# Notizen-App mit K8s Umgebung

Gruppe: **Ruben Neßler**, **Mario Di Caprio**

Eine simple Notizen-Anwendung mit **FastAPI** (Backend), implementiert nach dem 12-Factor-App-Prinzip und bereitgestellt mit Docker und Kubernetes.
Außerdem enthält sie eine Technologie (**Prometheus**) aus der [CNCF-Landscape](https://landscape.cncf.io/).


## Projektstruktur

| Bereich | Pfad | Techstack |
|---|---|---|
| **Backend** | `app/` | FastAPI REST-API + SQLAlchemy |
| **Infrastruktur** | `Dockerfile` | Docker Multi-Stage Build |
| **Kubernetes** | `k8s/` | Kubernetes-Manifeste (Deployments, Services, ConfigMaps, Secrets) |
| **Monitoring** | `k8s/prometheus-*.yaml` | Prometheus |

## Quick Start (lokal)

### Backend starten

```bash
# Abhängigkeiten installieren (mit uv)
uv sync

# Server starten
uvicorn app.main:app --reload
```

Die API ist unter `http://localhost:8000` erreichbar, die Swagger-Docs unter `http://localhost:8000/docs`.

## Docker

### Images bauen

```bash
# Backend-Image
docker build -t notizen-api:latest .
```

### Container starten

```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_DB=notizen \
  -e POSTGRES_USER=notizen \
  -e POSTGRES_PASSWORD=notizen \
  -p 5432:5432 \
  postgres:16-alpine

# Backend
docker run -d --name api \
  -e DATABASE_URL=postgresql+psycopg://notizen:notizen@postgres:5432/notizen \
  -p 8000:8000 \
  --link postgres \
  notizen-api:latest
```

## Kubernetes Deployment

```bash
# Namespace und alle Ressourcen anlegen
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/

# Status prüfen
kubectl get all -n notizen-app
```

---

## Struktur der Kubernetes-Manifeste

Im Verzeichnis `k8s/` befinden sich die YAML-Dateien, die zusammen die Infrastruktur der Anwendung im Cluster beschreiben. 
Im Folgenden wird erklärt, was jede Datei tut und wie die Manifeste zusammenhängen.

### Übersicht der Dateien

| Datei | Typ | Beschreibung |
|---|---|---|
| `namespace.yaml` | Namespace | Erstellt den Namespace `notizen-app`, in dem alle Ressourcen leben |
| `postgres-secret.yaml` | Secret | Enthält die Datenbank-Zugangsdaten (User, Passwort, DB-Name) |
| `postgres-pvc.yaml` | PersistentVolumeClaim | Fordert 1 GB persistenten Speicher für die PostgreSQL-Daten an |
| `postgres-deployment.yaml` | Deployment | Startet einen PostgreSQL-Pod mit dem Secret und dem PVC |
| `postgres-service.yaml` | Service (ClusterIP) | Macht PostgreSQL unter dem DNS-Namen `postgres` im Cluster erreichbar |
| `backend-configmap.yaml` | ConfigMap | Enthält die Umgebungsvariablen für das Backend (`DATABASE_URL`, `LOG_LEVEL`) |
| `backend-deployment.yaml` | Deployment | Startet 2 Replicas des FastAPI-Backends mit der ConfigMap |
| `backend-service.yaml` | Service (ClusterIP) | Macht das Backend unter dem DNS-Namen `api` im Cluster erreichbar |
| `prometheus-configmap.yaml` | ConfigMap | Prometheus-Konfiguration (Scrape-Targets und Intervalle) |
| `prometheus-deployment.yaml` | Deployment | Startet Prometheus zum Sammeln der Metriken |
| `prometheus-service.yaml` | Service (ClusterIP) | Macht Prometheus unter dem DNS-Namen `prometheus` erreichbar |
| `prometheus-servicemonitor.yaml` | ServiceMonitor | Konfiguriert den Prometheus Operator (optional) |

### Wie die Manifeste zusammenhängen

Die Manifeste bilden eine Abhängigkeitskette, die sich in drei Schichten gliedern lässt:

#### Schicht 1: Datenbank (PostgreSQL)

```
postgres-secret.yaml ──► postgres-deployment.yaml ◄── postgres-pvc.yaml
                                    │
                                    v
                          postgres-service.yaml
                          (DNS: "postgres:5432")
```

* Das **Secret** liefert die Zugangsdaten (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) per `envFrom.secretRef` an den PostgreSQL-Container. 
* Der **PersistentVolumeClaim** stellt sicher, dass die Daten auch bei einem Pod-Neustart erhalten bleiben, indem er als Volume in den Container gemountet (`/var/lib/postgresql/data`) wird. 
* Der **Service** gibt dem Pod einen DNS-Namen (`postgres`), über den andere Pods die Datenbank erreichen können.

#### Schicht 2: Backend (FastAPI)

```
backend-configmap.yaml –> backend-deployment.yaml
                                    │
                                    v
                           backend-service.yaml
                           (DNS: "api:8000")
```

* Die **ConfigMap** enthält die `DATABASE_URL`, die auf den PostgreSQL-Service verweist (`postgresql+psycopg://notizen:...@postgres:5432/notizen`). 
* Das Deployment lädt diese Umgebungsvariablen per `envFrom.configMapRef`. Dadurch weiß das Backend, wie es die Datenbank erreicht (der Hostname `postgres` wird über Kubernetes DNS automatisch zum PostgreSQL-Service aufgelöst). 
* Der **Service** macht das Backend unter dem Namen `api` erreichbar.

Jeder Backend-Pod hat Health-Checks definiert:
- **readinessProbe**: Prüft per HTTP-GET auf `/health`, ob der Pod bereit ist, Traffic zu empfangen
- **livenessProbe**: Prüft regelmäßig, ob der Pod noch lebt, und startet ihn bei Bedarf neu

#### Schicht 3: Monitoring (Prometheus)

```
prometheus-configmap.yaml ──> prometheus-deployment.yaml
                                        │
                                        v
                               prometheus-service.yaml
                               (DNS: "prometheus:9090")
```

* Die **Prometheus-ConfigMap** definiert, welche Targets gescraped werden (hier: `api:8000` alle 30 Sekunden). Prometheus sammelt die Metriken vom `/metrics`-Endpoint des Backends und speichert sie in seiner Zeitreihendatenbank.
* Der **ServiceMonitor** (`prometheus-servicemonitor.yaml`) ist ein optionales Manifest für den Prometheus Operator und wird nur benötigt, wenn dieser im Cluster installiert ist.

### Deployment-Reihenfolge

* Beim Anwenden der Manifeste mit `kubectl apply -f k8s/` werden alle Ressourcen gleichzeitig erstellt. 
* Die Readiness-Probes stellen sicher, dass ein Pod erst Traffic erhält, wenn er tatsächlich bereit ist. 
* Das Backend versucht beim Start, sich mit PostgreSQL zu verbinden. 
Sollte die Datenbank noch nicht bereit sein, wird der Pod neugestartet (durch die Liveness-Probe), bis die Verbindung steht.

---

## 12-Factor-App: Umsetzung

Die Anwendung orientiert sich am [12-Factor-App-Manifest](https://12factor.net/). 
Im Folgenden wird dokumentiert, welche Faktoren in welcher Form umgesetzt wurden.

### I. Codebase 

**Umgesetzt.** 
Das gesamte Projekt liegt in einem einzelnen Git-Repository. 
Aus dieser einen Codebase können verschiedene Deployments erzeugt werden (lokal, Docker, Kubernetes).

### II. Dependencies 

**Umgesetzt.** 
Alle Backend-Abhängigkeiten sind in `pyproject.toml` mit Versionsbereichen deklariert. 
Es gibt keine impliziten System-Abhängigkeiten, die Docker-Images enthalten alles Nötige.

### III. Config 

**Umgesetzt.** Konfigurationswerte werden über Umgebungsvariablen gesteuert:
- `DATABASE_URL`: Datenbank-Verbindung (Default: SQLite lokal, PostgreSQL in Kubernetes)
- `LOG_LEVEL`: Log-Level (Default: INFO)

* In Kubernetes werden diese über ConfigMaps (`k8s/backend-configmap.yaml`) und Secrets (`k8s/postgres-secret.yaml`) bereitgestellt.

### IV. Backing Services 

**Umgesetzt.** 
PostgreSQL ist ein externer Backing Service, der über die Umgebungsvariable `DATABASE_URL` angebunden wird. 
Ein Wechsel der Datenbank erfordert nur eine Änderung dieser Variable, nicht des Codes.

### V. Build, Release, Run 

**Umgesetzt.** Die Multi-Stage Dockerfiles trennen klar:
1. **Build**: Abhängigkeiten installieren
2. **Release**: Docker-Images mit bestimmtem Tag
3. **Run**: Container starten via `CMD` im Dockerfile

### VI. Processes 

**Umgesetzt.** 
Die FastAPI-Anwendung ist zustandslos. 
Jeder Request ist unabhängig, alle persistenten Daten liegen in der PostgreSQL-Datenbank. 
Mehrere Backend-Replicas können parallel laufen (`replicas: 2` im Kubernetes-Deployment).

### VII. Port Binding 

**Umgesetzt.** 
Das Backend bindet sich an Port 8000 (`uvicorn --port 8000`). 
Es exponiert seinen Service vollständig über HTTP.

### VIII. Concurrency 

**Umgesetzt.** 
Die Kubernetes-Deployments definieren `replicas: 2` für das Backend. 
Skalierung erfolgt so horizontal über weitere Pod-Replicas.

### IX. Disposability 

**Umgesetzt.** 
Die Container starten schnell (schlanke Python-Images). 
Health-Checks (`/health`) ermöglichen Kubernetes, nicht-bereite Pods zu entfernen. 
Liveness- und Readiness-Probes sind definiert.

### X. Dev/prod parity 

**Umgesetzt.** 
Lokal wird SQLite verwendet, in Produktion PostgreSQL, aber der Code bleibt identisch (SQLAlchemy als Abstraktion). 
Docker-Images sind in beiden Umgebungen die gleichen.

### XI. Logs 

**Umgesetzt.** 
Die Anwendung schreibt Logs auf `stdout` via Pythons `logging`-Modul (konfiguriert in `app/main.py`). 
In Kubernetes werden diese von der Container-Runtime eingesammelt und können an ein zentrales Log-System weitergeleitet werden.

### XII. Admin Processes 

**Teilweise umgesetzt.**  
Aktuell wird das DB-Schema automatisch beim Start erstellt (`Base.metadata.create_all`). 
Für eine produktive Anwendung könnten die Datenbank-Migrationen als Kubernetes-Jobs ausgeführt werden, z.B. indem man Alembic-Migrationen als Init-Container oder Job ausführt.

---

## 1. CNCF-Technologie: Prometheus


[Prometheus](https://prometheus.io/) ist ein Open-Source-Monitoring- und Alerting-System, das Teil der [Cloud Native Computing Foundation (CNCF)](https://www.cncf.io/) ist. 
Es wurde 2016 als zweites Projekt (nach Kubernetes) in die CNCF aufgenommen. 
Prometheus sammelt Metriken von konfigurierten Services in regelmäßigen Intervallen und speichert sie in einer Zeitreihendatenbank.

### Einsatz im Projekt

Die Prometheus-Integration erfolgt auf drei Ebenen:

#### 1. Backend-Instrumentierung

Das FastAPI-Backend verwendet die Bibliothek [`prometheus-client`](https://github.com/prometheus/client_python) (die offizielle Python-Client-Library von Prometheus). In `app/main.py` werden zwei Metriken definiert und über eine HTTP-Middleware bei jedem Request erfasst:

- **`http_requests_total`** (Counter): Zählt alle HTTP-Requests, aufgeschlüsselt nach Methode, Endpoint und Status-Code
- **`http_request_duration_seconds`** (Histogram): Misst die Antwortzeit jedes Requests in Sekunden, aufgeschlüsselt nach Methode und Endpoint

Die Integration in `app/main.py`:
```python
from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "endpoint", "status"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "HTTP request duration in seconds", ["method", "endpoint"])

@app.middleware("http")
async def prometheus_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    REQUEST_COUNT.labels(request.method, request.url.path, response.status_code).inc()
    REQUEST_DURATION.labels(request.method, request.url.path).observe(duration)
    return response

@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type="text/plain")
```

Der `/metrics`-Endpoint liefert Metriken im Prometheus-Textformat, z.B.:
```
http_requests_total{endpoint="/notes",method="GET",status="200"} 42.0
http_request_duration_seconds_bucket{endpoint="/notes",method="GET",le="0.1"} 38.0
```

#### 2. Eigene Prometheus-Instanz im Cluster

Im Verzeichnis `k8s/` wird eine eigene Prometheus-Instanz als Deployment bereitgestellt (kein clusterweiter Prometheus Operator nötig). Die Konfiguration erfolgt über die ConfigMap `prometheus-configmap.yaml`:

```yaml
scrape_configs:
  - job_name: "notizen-api"
    static_configs:
      - targets: ["api:8000"]
    metrics_path: /metrics
```

Prometheus scraped den Backend-Service `api:8000` alle 30 Sekunden über Kubernetes DNS und speichert die Metriken in seiner Zeitreihendatenbank. Der Prometheus-Service ist unter `prometheus:9090` im Cluster erreichbar.

#### 3. Kubernetes-Annotations und ServiceMonitor (optional)

Die Backend-Pods tragen zusätzlich Prometheus-Annotations für den Fall, dass ein clusterweiter Prometheus Operator installiert ist:
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8000"
  prometheus.io/path: "/metrics"
```

Der `ServiceMonitor` (`k8s/prometheus-servicemonitor.yaml`) ist ein optionales Manifest für den Prometheus Operator und wird nur benötigt, wenn dieser im Cluster vorhanden ist.

### Warum Prometheus im Projektkontext sinnvoll ist

- **Standardisierung**: Prometheus ist (einer) der Standard für Monitoring in Kubernetes-Umgebungen
- **Automatische Service-Discovery**: Durch ServiceMonitor und Pod-Annotations findet Prometheus neue Backends automatisch
- **Skalierbarkeit**: Funktioniert mit beliebig vielen Backend-Replicas
- **Alerting**: Auf Basis der Metriken können Alerts definiert werden (z.B. bei hoher Latenz oder Fehlerrate)
- **Visualisierung**: Die gesammelten Metriken lassen sich in Grafana (ebenfalls Teil der CNCF) als Dashboards darstellen
