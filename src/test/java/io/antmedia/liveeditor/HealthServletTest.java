package io.antmedia.liveeditor;

import org.junit.Test;

import static org.junit.Assert.assertNotNull;

public class HealthServletTest {

	@Test
	public void shouldInstantiateServlet() {
		HealthServlet servlet = new HealthServlet();
		assertNotNull(servlet);
	}
}
