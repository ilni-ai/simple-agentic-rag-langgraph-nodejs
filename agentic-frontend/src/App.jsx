import { useState } from "react";
import {
  Container,
  Form,
  Button,
  Card,
  ListGroup,
  Spinner,
  Alert,
} from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState("demo-session");
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    const prev = [...history];
    try {
      const res = await fetch("http://localhost:5000/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });
      const data = await res.json();
      prev.push({ user: question, bot: data.answer, followUp: data.followUp });
      setHistory(prev);
      setQuestion("");
      setSummary(""); // Clear summary after new message
    } catch (err) {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const res = await fetch("http://localhost:5000/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (err) {
      alert("Failed to generate summary");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <Container className="py-4">
      <Card className="mb-4 shadow">
        <Card.Body>
          <Card.Title>LangGraph AI Assistant</Card.Title>
          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="questionInput">
              <Form.Label>Ask a question:</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., What is LangGraph?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </Form.Group>
            <Form.Group controlId="sessionInput" className="mt-2">
              <Form.Label>Session ID:</Form.Label>
              <Form.Control
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </Form.Group>
            <Button
              variant="primary"
              type="submit"
              className="mt-3 me-2"
              disabled={loading}
            >
              {loading ? <Spinner size="sm" animation="border" /> : "Ask"}
            </Button>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={handleSummarize}
              disabled={summarizing}
            >
              {summarizing ? (
                <Spinner size="sm" animation="border" />
              ) : (
                "Summarize Conversation"
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <h4>Chat History</h4>
      <ListGroup>
        {history.map((item, idx) => (
          <ListGroup.Item key={idx} className="mb-3">
            <strong>You:</strong> {item.user}
            <br />
            <strong>Bot:</strong> {item.bot}
            {item.followUp && (
              <div className="mt-2">
                <strong>Follow-up suggestions:</strong>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {item.followUp
                    .split("\n")
                    .filter(Boolean)
                    .map((q, i) => (
                      <Button
                        key={i}
                        variant="outline-primary"
                        size="sm"
                        onClick={() => setQuestion(q)}
                      >
                        {q}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>

      {summary && (
        <Alert variant="info" className="mt-4">
          <strong>Conversation Summary:</strong>
          <div className="mt-2">{summary}</div>
        </Alert>
      )}
    </Container>
  );
}

export default App;
