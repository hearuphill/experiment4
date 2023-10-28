package com.example.demo.demos.webservice.service;

import javax.jws.WebMethod;
import javax.jws.WebParam;
import javax.jws.WebService;

/**
 * 用户服务类 必须使用 @WebService
 * */
@WebService(name = "userPortType")
public interface MyService {

    @WebMethod(operationName="calculatePersonalIncomeTax")
    public double calculatePersonalIncomeTax(@WebParam(name = "id") double grossIncome);
}
