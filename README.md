# Notizen-App mit K8s Umgebung

Gruppe: **Ruben Neßler**, **Mario Di Caprio**

Eine simple Notizen-Anwendung mit **FastAPI** (Backend) und **React + Vite** (Frontend), implementiert nach dem 12-Factor-App-Prinzip und bereitgestellt mit Docker und Kubernetes.
Außerdem enthält sie zwei Technologien (**Prometheus** und **Grafana**) aus der [CNCF-Landscape](https://landscape.cncf.io/).


## Projektstruktur

| Bereich | Pfad | Techstack |
|---|---|---|
| **Backend** | `app/` | FastAPI REST-API + SQLAlchemy |
| **Frontend** | `frontend/` | React + Vite + nginx |
| **Infrastruktur** | `Dockerfile`, `frontend/Dockerfile` | Docker Multi-Stage Builds |
| **Kubernetes** | `k8s/` | Kubernetes-Manifeste (Deployments, Services, ConfigMaps, Secrets) |
| **Monitoring** | `k8s/prometheus-*.yaml`, `k8s/grafana-*.yaml` | Prometheus + Grafana |

## Quick Start (lokal)

### Backend starten

```bash
# Abhängigkeiten installieren (mit uv)
uv sync

# Server starten
uvicorn app.main:app --reload
```

Die API ist unter `http://localhost:8000` erreichbar, die Swagger-Docs unter `http://localhost:8000/docs`.

### Frontend starten

```bash
cd frontend
npm install
npm run dev
```

Das Frontend ist unter `http://localhost:5173` erreichbar und leitet API-Requests via Proxy an das Backend weiter.

## Docker

### Images bauen

```bash
# Backend-Image
docker build -t notizen-api:latest .

# Frontend-Image
docker build -t notizen-frontend:latest ./frontend
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

# Frontend
docker run -d --name frontend \
  -p 80:80 \
  --link api \
  notizen-frontend:latest
```

## Kubernetes Deployment

```bash
# Namespace und alle Ressourcen anlegen
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/

# Status prüfen
kubectl get all -n notizen-app
```

### Port-Forwarding

Da die Services im Cluster laufen, wird `kubectl port-forward` verwendet, um sie lokal im Browser zu öffnen:

```bash
# Frontend (Notizen-App)
kubectl port-forward -n notizen-app svc/frontend 8080:80
# -> http://localhost:8080

# Grafana (Monitoring-Dashboard)
kubectl port-forward -n notizen-app svc/grafana 3000:3000
# -> http://localhost:3000
```

### Kommunikation zwischen Frontend und Backend

* Das Frontend (nginx) leitet API-Requests (`/notes`, `/health`, `/metrics`, `/docs`) via `proxy_pass` an den Backend-Service (`api:8000`) weiter. 
* Die Service-Discovery erfolgt über Kubernetes DNS. Der Service-Name `api` wird innerhalb des Namespaces `notizen-app` automatisch aufgelöst.

---

## Struktur der Kubernetes-Manifeste

Im Verzeichnis `k8s/` befinden sich 18 YAML-Dateien, die zusammen die vollständige Infrastruktur der Anwendung im Cluster beschreiben. 
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
| `frontend-deployment.yaml` | Deployment | Startet 2 Replicas des nginx-Frontends |
| `frontend-service.yaml` | Service (NodePort) | Macht das Frontend von außerhalb des Clusters erreichbar |
| `prometheus-configmap.yaml` | ConfigMap | Prometheus-Konfiguration (Scrape-Targets und Intervalle) |
| `prometheus-deployment.yaml` | Deployment | Startet Prometheus zum Sammeln der Metriken |
| `prometheus-service.yaml` | Service (ClusterIP) | Macht Prometheus unter dem DNS-Namen `prometheus` erreichbar |
| `prometheus-servicemonitor.yaml` | ServiceMonitor | Konfiguriert den Prometheus Operator (optional) |
| `grafana-datasource.yaml` | ConfigMap | Konfiguriert Prometheus als Datenquelle für Grafana |
| `grafana-dashboard.yaml` | ConfigMap | Enthält ein vorkonfiguriertes Dashboard für die Notizen-API |
| `grafana-deployment.yaml` | Deployment | Startet Grafana mit automatisch provisionierten Dashboards |
| `grafana-service.yaml` | Service (NodePort) | Macht Grafana von außerhalb des Clusters erreichbar |

### Wie die Manifeste zusammenhängen

Die Manifeste bilden eine Abhängigkeitskette, die sich in vier Schichten gliedern lässt:

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
* Der **Service** macht das Backend unter dem Namen `api` für das Frontend erreichbar.

Jeder Backend-Pod hat Health-Checks definiert:
- **readinessProbe**: Prüft per HTTP-GET auf `/health`, ob der Pod bereit ist, Traffic zu empfangen
- **livenessProbe**: Prüft regelmäßig, ob der Pod noch lebt, und startet ihn bei Bedarf neu

#### Schicht 3: Frontend (nginx)

```
frontend-deployment.yaml
         │
         v
frontend-service.yaml
(NodePort - extern erreichbar)
```

* Das Frontend benötigt keine ConfigMap oder Secrets. Die nginx-Konfiguration (im Docker-Image eingebettet) leitet API-Requests per `proxy_pass` an `http://api:8000` weiter. 
Der Hostname `api` wird über Kubernetes DNS zum Backend-Service aufgelöst. 
Der **Service** ist vom Typ `NodePort`, sodass das Frontend von außerhalb des Clusters erreichbar ist.

#### Schicht 4: Monitoring (Prometheus + Grafana)

```
prometheus-configmap.yaml ──> prometheus-deployment.yaml
                                        │
                                        v
                               prometheus-service.yaml
                               (DNS: "prometheus:9090")
                                        │
                                        v
grafana-datasource.yaml ──> grafana-deployment.yaml <── grafana-dashboard.yaml
                                        │
                                        v
                               grafana-service.yaml
                               (NodePort - extern erreichbar)
```

* Die **Prometheus-ConfigMap** definiert, welche Targets gescraped werden (hier: `api:8000` alle 30 Sekunden). Prometheus sammelt die Metriken vom `/metrics`-Endpoint des Backends und speichert sie in seiner Zeitreihendatenbank.
* Die **Grafana-Datasource-ConfigMap** konfiguriert Prometheus automatisch als Datenquelle (`http://prometheus:9090`). Die **Dashboard-ConfigMap** enthält ein vorkonfiguriertes Dashboard mit Panels für Request-Rate, Antwortzeiten (p95), Gesamtzahl der Requests und Fehlerrate.
* Der **ServiceMonitor** (`prometheus-servicemonitor.yaml`) ist ein optionales Manifest für den Prometheus Operator und wird nur benötigt, wenn dieser im Cluster installiert ist.

### Übersicht - Netzwerk-Kommunikation

```
                    ┌──────────────────────────────────────────────────┐
                    │              Namespace: notizen-app              │
                    │                                                  │
  Benutzer ──>  NodePort:80                         NodePort:3000      │
                    │                                    │             │
                    v                                    v             │
              ┌───────────┐    /notes     ┌───────────┐  ┌──────────┐  │
              │  Frontend │ ────────────► │  Backend  │  │  Grafana │  │
              │  (nginx)  │  proxy_pass   │  (FastAPI)│  │ Dashboards  │
              │  2 Replica│ ◄──────────── │  2 Replica│  └─────┬────┘  │
              └───────────┘               └──┬────┬───┘        │       │
                                             │    │            │       │
                                    DATABASE_URL  │ /metrics   │       │
                                             │    │            │       │
                                             v    v            v       │
                                       ┌─────────┐    ┌────────────┐   │
                                       │PostgreSQL│   │ Prometheus │   │
                                       │ 1 Replica│   |   scrapes  │   │
                                       │  + PVC   │   │  api:8000  │   │
                                       └─────────┘    └────────────┘   │
                    └──────────────────────────────────────────────────┘
```

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
Alle Frontend-Abhängigkeiten stehen in `package.json`. 
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
1. **Build**: Abhängigkeiten installieren, Frontend kompilieren
2. **Release**: Docker-Images mit bestimmtem Tag
3. **Run**: Container starten via `CMD` im Dockerfile

### VI. Processes 

**Umgesetzt.** 
Die FastAPI-Anwendung ist zustandslos. 
Jeder Request ist unabhängig, alle persistenten Daten liegen in der PostgreSQL-Datenbank. 
Mehrere Backend-Replicas können parallel laufen (`replicas: 2` im Kubernetes-Deployment).

### VII. Port Binding 

**Umgesetzt.** 
Das Backend bindet sich an Port 8000 (`uvicorn --port 8000`), das Frontend an Port 80 (nginx). 
Beide exponieren ihren Service vollständig über HTTP.

### VIII. Concurrency 

**Umgesetzt.** 
Die Kubernetes-Deployments definieren `replicas: 2` für Backend und Frontend. 
Skalierung erfolgt so horizontal über weitere Pod-Replicas.

### IX. Disposability 

**Umgesetzt.** 
Die Container starten schnell (schlanke Python/nginx-Images). 
Health-Checks (`/health`) ermöglichen Kubernetes, nicht-bereite Pods zu entfernen. 
Liveness- und Readiness-Probes sind definiert.

### X. Dev/prod parity 

**Umgesetzt.** 
* Lokal wird SQLite verwendet, in Produktion PostgreSQL, aber der Code bleibt identisch (SQLAlchemy als Abstraktion). 
* Docker-Images sind in beiden Umgebungen die gleichen. 
* Die Vite-Proxy-Konfiguration bildet das nginx-Routing lokal nach.

### XI. Logs 

**Umgesetzt.** 
Die Anwendung schreibt Logs auf `stdout` via Pythons `logging`-Modul (konfiguriert in `app/main.py`). 
In Kubernetes werden diese von der Container-Runtime eingesammelt und können an ein zentrales Log-System weitergeleitet werden.

### XII. Admin Processes 

**Teilweise umgesetzt.**  
Aktuell wird das DB-Schema automatisch beim Start erstellt (`Base.metadata.create_all`). 
Für eine produktive Anwendung könnten die Datenbank-Migrationen könnten als Kubernetes-Jobs ausgeführt werden, z.B. indem man Alembic-Migrationen als Init-Container oder Job ausführt.

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

---

## 2. CNCF-Technologie: Grafana

[Grafana](https://grafana.com/) ist eine Open-Source-Plattform für Monitoring und Observability, die ebenfalls Teil der [CNCF](https://www.cncf.io/) ist. 
Grafana ermöglicht die Visualisierung von Metriken, Logs und Traces aus verschiedenen Datenquellen in konfigurierbaren Dashboards.

### Einsatz im Projekt

Grafana wird im Cluster als eigener Pod betrieben und ist über einen NodePort-Service von außen erreichbar. 
Die Konfiguration erfolgt automatisiert über Kubernetes-ConfigMaps (Provisioning):

#### Automatische Datenquellen-Konfiguration

Über die ConfigMap `grafana-datasource.yaml` wird Prometheus beim Start automatisch als Datenquelle registriert:
```yaml
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

Grafana erreicht Prometheus über den Kubernetes-Service-DNS-Namen `prometheus:9090`.

#### Vorkonfiguriertes Dashboard

Die ConfigMap `grafana-dashboard.yaml` enthält ein JSON-Dashboard, das beim Start automatisch geladen wird. Es enthält vier Panels:

* Request Rate: Requests pro Sekunde, aufgeschlüsselt nach Methode, Endpoint und Status
* Request Duration (p95): 95. Perzentil der Antwortzeiten
* Total Requests: Gesamtanzahl aller bisherigen Requests
* Error Rate: Anteil der 5er-Fehler in Prozent

#### Zugang

Da Grafana als ClusterIP/NodePort-Service im Cluster läuft, wird `kubectl port-forward` verwendet, um das Dashboard lokal im Browser zu öffnen:

```bash
# Port-Forward starten
kubectl port-forward -n notizen-app svc/grafana 3000:3000

# Grafana dann erreichbar unter:
# http://localhost:3000
```

Der anonyme Lesezugriff ist aktiviert (`GF_AUTH_ANONYMOUS_ENABLED=true`), sodass Dashboards ohne Login eingesehen werden können. Das vorkonfigurierte Dashboard findet sich unter: 
**Menü (links) –> Dashboards –> Notizen API**

### Warum Grafana im Projektkontext sinnvoll ist

- **Ergänzung zu Prometheus**: Prometheus sammelt und speichert Metriken, Grafana visualisiert sie 
- **Automatisiertes Setup**: Durch Provisioning über ConfigMaps wird Grafana vollständig deklarativ konfiguriert
- **CNCF-Ökosystem**: Grafana und Prometheus sind das Standard-Monitoring-Duo in Cloud-Native-Umgebungen und werden häufig gemeinsam eingesetzt
